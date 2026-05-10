import { supabase } from "../../../lib/supabase";

/**
 * GET /api/admin/orders
 *
 * Query params:
 *   ?status=deposit_paid,authorized   (comma-separated filter)
 *   ?limit=50
 *   ?offset=0
 *
 * Returns orders with customer info, items, and payment history.
 */

function verifyAdmin(req) {
  if (process.env.ADMIN_SECRET) {
    return req.headers.authorization === `Bearer ${process.env.ADMIN_SECRET}`;
  }
  return process.env.NODE_ENV !== "production";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      status: statusFilter,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = supabase
      .from("orders")
      .select("*, customers(*), order_items(*), payments(*)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Filter by status(es)
    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim());
      if (statuses.length === 1) {
        query = query.eq("status", statuses[0]);
      } else {
        query = query.in("status", statuses);
      }
    }

    const { data: orders, error, count } = await query;

    if (error) throw new Error(`query orders: ${error.message}`);

    // Summarize each order for easy reading
    const enriched = (orders || []).map((o) => {
      const rentItems = (o.order_items || []).filter((i) => i.mode === "rent");
      const buyItems = (o.order_items || []).filter((i) => i.mode === "buy-new");
      return {
        ...o,
        _summary: {
          customerEmail: o.customers?.email,
          customerName: o.customers?.name,
          rentSets: rentItems.length,
          buySets: buyItems.length,
          monthlyRent: `$${(o.rental_monthly_cents / 100).toFixed(2)}`,
          buyTotal: `$${(o.buy_total_cents / 100).toFixed(2)}`,
          deliveryFee: `$${(o.delivery_fee_cents / 100).toFixed(2)}`,
          paymentCount: (o.payments || []).length,
        },
      };
    });

    res.status(200).json({
      orders: enriched,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error("admin orders error:", err);
    res.status(500).json({ error: err.message });
  }
}
