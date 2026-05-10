import { supabase } from "../../../lib/supabase";

/**
 * GET /api/user/portal-status?token=<email-token>
 *
 * Returns the user-facing status (①–⑩) for the customer portal.
 * The designer's HTML page calls this to know what to display.
 *
 * Token is a base64-encoded email. In production, replace with
 * a proper signed token (e.g. JWT or Supabase magic link).
 *
 * Response shape:
 * {
 *   step: 1-10,
 *   label: "Delivery scheduled",
 *   customer: { name, email },
 *   order: { ... } | null,
 *   items: [...],
 *   payments: [...],
 *   meta: { ... }     // extra info depending on step
 * }
 */

// CORS — allow the portal page (could be hosted anywhere)
function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = [
    "https://roomonyc.com",
    "https://www.roomonyc.com",
  ];
  if (
    allowed.some((a) => origin.startsWith(a)) ||
    origin.includes("framer") ||
    origin.includes("localhost")
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

// Derive step 1–10 from backend data
function deriveStep(customer, order) {
  // ① No order yet
  if (!order) return { step: 1, label: "No order yet" };

  const s = order.status;

  // ⑥ Payment failed (check first — can happen at multiple stages)
  if (s === "failed" || s === "auth_failed" || s === "delinquent") {
    return { step: 6, label: "Payment failed" };
  }

  // ② Checkout incomplete
  if (s === "pending") {
    return { step: 2, label: "Checkout incomplete" };
  }

  // ③ Confirmed & scheduled (deposit paid, delivery date set)
  if (s === "deposit_paid") {
    return { step: 3, label: "Confirmed & scheduled" };
  }

  // ④ Delivery within 48h (pre-auth done)
  if (s === "authorized") {
    return { step: 4, label: "Delivery within 48h" };
  }

  // ⑤ Active rental / owned
  if (s === "active" || s === "delivered") {
    // "delivered" without a subscription = purchased or bought out → they own it
    if (s === "delivered") {
      return {
        step: 5,
        label: "It's yours!",
        meta: { owned: true },
      };
    }

    // Active rental — check if term ending soon (≤ 30 days left)
    if (order.subscription_ends_at) {
      const endsAt = new Date(order.subscription_ends_at);
      const daysLeft = (endsAt - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 30) {
        return {
          step: 7,
          label: "Term ending soon",
          meta: { daysLeft: Math.max(0, Math.ceil(daysLeft)) },
        };
      }
    }
    return { step: 5, label: "Active rental" };
  }

  // ⑥ Payment failed
  // (also caught above, but keeping as safety net)

  // ⑧ Return scheduled
  if (s === "return_scheduled") {
    return {
      step: 8,
      label: "Return scheduled",
      meta: { returnDate: order.return_date },
    };
  }

  // ⑨ Plan completed
  if (s === "completed") {
    return { step: 9, label: "Plan completed" };
  }

  // Fallback for refunded or unknown
  if (s === "refunded") {
    return { step: 9, label: "Plan completed", meta: { refunded: true } };
  }

  return { step: 1, label: "No order yet" };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: "Missing token parameter" });
  }

  try {
    // Decode email from token (simple base64 for now)
    let email;
    try {
      email = Buffer.from(token, "base64").toString("utf-8");
    } catch {
      return res.status(400).json({ error: "Invalid token" });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid token" });
    }

    // Fetch customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("*")
      .eq("email", email)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Fetch most recent active order (not refunded/failed)
    // If they have multiple orders, show the most relevant one
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("*, order_items(*), payments(*)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (ordersErr) throw new Error(`fetch orders: ${ordersErr.message}`);

    // Find the most relevant order:
    // Priority: active/authorized/deposit_paid > return_scheduled > completed > pending > failed/refunded
    const priority = {
      active: 1,
      authorized: 2,
      deposit_paid: 3,
      return_scheduled: 4,
      delivered: 5,
      pending: 6,
      delinquent: 7,
      auth_failed: 8,
      completed: 9,
      failed: 10,
      refunded: 11,
    };

    const sorted = (orders || []).sort(
      (a, b) => (priority[a.status] || 99) - (priority[b.status] || 99)
    );

    const order = sorted[0] || null;

    // Derive user-facing step
    const { step, label, meta } = deriveStep(customer, order);

    // Build response
    const response = {
      step,
      label,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      order: order
        ? {
            id: order.id,
            status: order.status,
            deliveryDate: order.delivery_date,
            deliverySlot: order.delivery_slot,
            deliveryAddress: [
              order.delivery_address,
              order.delivery_unit,
              `${order.delivery_city}, ${order.delivery_state} ${order.delivery_zip}`,
            ]
              .filter(Boolean)
              .join(", "),
            deliveryStreet: order.delivery_address || "",
            deliveryUnit: order.delivery_unit || "",
            deliveryCity: order.delivery_city || "",
            deliveryState: order.delivery_state || "",
            deliveryZip: order.delivery_zip || "",
            deliveryFee: order.delivery_fee_cents / 100,
            monthlyRent: order.rental_monthly_cents / 100,
            buyTotal: order.buy_total_cents / 100,
            securityDeposit: (order.security_deposit_cents || 0) / 100,
            subscriptionEndsAt: order.subscription_ends_at,
            returnDate: order.return_date,
            createdAt: order.created_at,
          }
        : null,
      items: order
        ? (order.order_items || []).map((i) => ({
            setType: i.set_type,
            mode: i.mode,
            palette: i.palette,
            months: i.months,
            pricePerMonth: i.price_cents / 100,
            excluded: i.excluded,
          }))
        : [],
      payments: order
        ? (order.payments || [])
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map((p) => ({
              type: p.type,
              amount: p.amount_cents / 100,
              status: p.status,
              description: p.description,
              date: p.created_at,
            }))
        : [],
      totalOrders: (orders || []).length,
      meta: meta || {},
    };

    // For active rentals, calculate buyout quote so the portal can show
    // "Want to keep it? Pay $X to own it."
    if (order && order.status === "active" && order.rental_monthly_cents > 0) {
      const BASE_12MO_CENTS = {
        living: 349_00,
        dining: 249_00,
        bedding: 199_00,
      };

      const rentItems = (order.order_items || []).filter((i) => i.mode === "rent");
      const totalBuyPrice = rentItems.reduce(
        (sum, item) => sum + (BASE_12MO_CENTS[item.set_type] || item.price_cents) * 16,
        0
      );

      const totalPaid = (order.payments || [])
        .filter((p) =>
          p.status === "succeeded" &&
          ["deposit", "pre_auth_capture", "subscription"].includes(p.type)
        )
        .reduce((sum, p) => sum + p.amount_cents, 0);

      const securityDeposit = order.security_deposit_cents || 0;
      const buyoutAmount = Math.max(0, totalBuyPrice - totalPaid - securityDeposit);

      response.buyout = {
        available: true,
        buyPrice: totalBuyPrice / 100,
        alreadyPaid: totalPaid / 100,
        securityDepositCredit: securityDeposit / 100,
        amountDue: buyoutAmount / 100,
      };
    }

    res.status(200).json(response);
  } catch (err) {
    console.error("portal-status error:", err);
    res.status(500).json({ error: err.message });
  }
}
