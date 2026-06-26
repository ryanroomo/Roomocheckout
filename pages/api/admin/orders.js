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

    // ---- Build the data query ----
    let query = supabase
      .from("orders")
      .select("*, order_items(*), payments(*), customers!inner(*)");

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

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

    if (statusFilter && statusFilter !== "all") {
      countQuery = countQuery.eq("status", statusFilter);
    }

    if (search) {
      countQuery = countQuery.or(
        `name.ilike.%${search}%,email.ilike.%${search}%`,
        { referencedTable: "customers" }
      );
    }

    const { count, error: countError } = await countQuery;

    if (countError) throw new Error(`count orders: ${countError.message}`);

    // ---- Map to camelCase response ----
    const mapped = (orders || []).map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.created_at,
      deliveryDate: o.delivery_date,
      deliverySlot: o.delivery_slot,
      deliveryAddress: o.delivery_address,
      depositCents: o.deposit_cents,
      rentalMonthlyCents: o.rental_monthly_cents,
      buyTotalCents: o.buy_total_cents,
      deliveryFeeCents: o.delivery_fee_cents,
      couponCode: o.coupon_code,
      discountCents: o.discount_cents,
      cancelledAt: o.cancelled_at,
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
