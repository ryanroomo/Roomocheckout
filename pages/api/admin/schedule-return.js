import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/schedule-return
 *
 * Schedules a furniture pickup date for a completed/active order.
 * Transitions the order to "return_scheduled".
 *
 * Body: { orderId: string, returnDate: "YYYY-MM-DD" }
 */

function verifyAdmin(req) {
  if (process.env.ADMIN_SECRET) {
    return req.headers.authorization === `Bearer ${process.env.ADMIN_SECRET}`;
  }
  return process.env.NODE_ENV !== "production";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { orderId, returnDate } = req.body;
  if (!orderId || !returnDate) {
    return res.status(400).json({ error: "Missing orderId or returnDate" });
  }

  try {
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Can schedule return from active (term ended) or completed
    const allowed = ["active", "completed", "delivered"];
    if (!allowed.includes(order.status)) {
      return res.status(400).json({
        error: `Cannot schedule return: order status is "${order.status}"`,
      });
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "return_scheduled",
        return_date: returnDate,
      })
      .eq("id", orderId);

    if (updateErr) throw new Error(`update: ${updateErr.message}`);

    res.status(200).json({ success: true, orderId, returnDate });
  } catch (err) {
    console.error("schedule-return error:", err);
    res.status(500).json({ error: err.message });
  }
}
