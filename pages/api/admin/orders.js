import { supabase } from "../../../lib/supabase";

/**
 * GET /api/admin/orders
 *
 * Query params:
 *   ?status=deposit_paid        (filter by status; omit or "all" for everything)
 *   ?search=john                (case-insensitive search on customer name or email)
 *   ?limit=50
 *   ?offset=0
 *
 * Returns orders with customer info, items, and payment history
 * in camelCase format.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const expected = process.env.ADMIN_PASSWORD;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      status: statusFilter,
      search,
      limit: rawLimit = "50",
      offset: rawOffset = "0",
    } = req.query;

    const limit = parseInt(rawLimit, 10) || 50;
    const offset = parseInt(rawOffset, 10) || 0;

    // Applies the status filter. Supports a synthetic "refund_requested" value:
    // orders with a pending refund request awaiting admin action.
    const applyStatusFilter = (q) => {
      if (!statusFilter || statusFilter === "all") return q;
      if (statusFilter === "refund_requested") {
        return q
          .not("refund_requested_at", "is", null)
          .in("status", ["deposit_paid", "authorized"]);
      }
      return q.eq("status", statusFilter);
    };

    // ---- Build the data query ----
    let query = supabase
      .from("orders")
      .select(
        "*, order_items(*), payments(*), customers!inner(*), inspections(status, submitted_at, email_sent_at, confirmed_at)"
      );

    query = applyStatusFilter(query);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%`,
        { referencedTable: "customers" }
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: orders, error } = await query;

    if (error) throw new Error(`query orders: ${error.message}`);

    // ---- Separate count query (no range) ----
    let countQuery = supabase
      .from("orders")
      .select("*, customers!inner(*)", { count: "exact", head: true });

    countQuery = applyStatusFilter(countQuery);

    if (search) {
      countQuery = countQuery.or(
        `name.ilike.%${search}%,email.ilike.%${search}%`,
        { referencedTable: "customers" }
      );
    }

    const { count, error: countError } = await countQuery;

    if (countError) throw new Error(`count orders: ${countError.message}`);

    // ---- Fetch promo rules for any coupons on these orders ----
    // Used so "next charge" can show the real discounted amount on the
    // subscription months that the intro discount still covers.
    const couponCodes = [
      ...new Set((orders || []).map((o) => o.coupon_code).filter(Boolean)),
    ];
    const couponRules = {};
    if (couponCodes.length) {
      const { data: coupons } = await supabase
        .from("coupons")
        .select(
          "code, promo_type, intro_discount_pct, intro_discount_months, free_month_min_lease, bonus_free_months"
        )
        .in("code", couponCodes);
      (coupons || []).forEach((c) => {
        couponRules[c.code] = c;
      });
    }

    // ---- Map to camelCase response ----
    const mapped = (orders || []).map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.created_at,
      deliveryDate: o.delivery_date,
      deliverySlot: o.delivery_slot,
      deliveryAddress: o.delivery_address,
      deliveryUnit: o.delivery_unit,
      deliveryCity: o.delivery_city,
      deliveryState: o.delivery_state,
      deliveryZip: o.delivery_zip,
      depositCents: o.deposit_cents,
      rentalMonthlyCents: o.rental_monthly_cents,
      buyTotalCents: o.buy_total_cents,
      deliveryFeeCents: o.delivery_fee_cents,
      couponCode: o.coupon_code,
      discountCents: o.discount_cents,
      bonusFreeMonths: o.bonus_free_months,
      refundRequestedAt: o.refund_requested_at,
      refundRequestReason: o.refund_request_reason,
      introDiscountMonths:
        (o.coupon_code && couponRules[o.coupon_code]?.intro_discount_months) || 0,
      introDiscountPct:
        (o.coupon_code && Number(couponRules[o.coupon_code]?.intro_discount_pct)) || 0,
      cancelledAt: o.cancelled_at,
      // Fields used to compute "amount charged so far" and "next charge":
      deliveredAt: o.delivered_at,
      refundDeadline: o.refund_deadline,
      authorizedAmountCents: o.authorized_amount_cents,
      securityDepositCents: o.security_deposit_cents,
      subscriptionEndsAt: o.subscription_ends_at,
      stripeSubscriptionId: o.stripe_subscription_id,
      returnDate: o.return_date,
      // Virtual inspection progress (one row per order, if any)
      inspection: (() => {
        const insp = Array.isArray(o.inspections) ? o.inspections[0] : o.inspections;
        return insp
          ? {
              status: insp.status,
              submittedAt: insp.submitted_at,
              emailSentAt: insp.email_sent_at,
              confirmedAt: insp.confirmed_at,
            }
          : null;
      })(),
      customer: o.customers
        ? {
            name: o.customers.name,
            email: o.customers.email,
            phone: o.customers.phone,
          }
        : null,
      items: (o.order_items || []).map((i) => ({
        setType: i.set_type,
        mode: i.mode,
        palette: i.palette,
        months: i.months,
        priceCents: i.price_cents,
      })),
      payments: (o.payments || []).map((p) => ({
        type: p.type,
        amountCents: p.amount_cents,
        status: p.status,
        date: p.created_at,
      })),
    }));

    res.status(200).json({
      orders: mapped,
      total: count,
      limit,
      offset,
    });
  } catch (err) {
    console.error("admin orders error:", err);
    res.status(500).json({ error: err.message });
  }
}
