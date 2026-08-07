import { supabase } from "../../../lib/supabase";
import { sendInspectionEmail } from "../../../lib/email";
import { signInspectionToken } from "../../../lib/authToken";

/**
 * POST /api/admin/send-inspection  (admin only)
 * Body: { orderId, force? }
 *
 * Emails the customer their virtual inspection link (signed, expiring
 * token). Normally requires the workers to have submitted their photos
 * and videos first; pass force:true to send anyway (the admin UI asks).
 * On-site deliveries don't need this — the worker hands the customer
 * the on-site confirmation form directly.
 */

const SET_NAMES = {
  living: "Living Room Set",
  dining: "Dining Set",
  bedding: "Bedroom Set",
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function verifyAdmin(req) {
  const pw = (req.headers.authorization || "").replace("Bearer ", "");
  return !!pw && (pw === process.env.ADMIN_PASSWORD || pw === process.env.ADMIN_SECRET);
}

// "August 12, 2026 at 5:00 PM" in NY time — 48h after delivery/handover.
function deadline48h(baseIso) {
  const base = baseIso ? new Date(baseIso) : new Date();
  const d = new Date(base.getTime() + 48 * 60 * 60 * 1000);
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { orderId, force } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, customers!inner(*), order_items(*)")
      .eq("id", orderId)
      .single();
    if (error || !order) return res.status(404).json({ error: "Order not found" });

    const email = order.customers?.email;
    const name = order.customers?.name || "";
    if (!email) return res.status(400).json({ error: "Order has no customer email" });

    const { data: inspection } = await supabase
      .from("inspections")
      .select("status, submitted_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!force && (!inspection || inspection.status === "pending")) {
      return res.status(409).json({
        error: "The workers haven't submitted this order's inspection photos/videos yet.",
        needsForce: true,
      });
    }

    const token = signInspectionToken(orderId, "customer");
    const base = process.env.PUBLIC_BASE_URL || "https://checkout.roomonyc.com";
    const inspectionUrl = `${base}/virtual-inspection.html?token=${encodeURIComponent(token)}`;

    const sets = (order.order_items || [])
      .map((i) => SET_NAMES[String(i.set_type || "").toLowerCase()] || null)
      .filter(Boolean);

    const data = await sendInspectionEmail({
      email,
      name,
      inspectionUrl,
      deadlineText: deadline48h(order.delivered_at || inspection?.submitted_at),
      sets,
    });

    await supabase.from("inspections").upsert(
      { order_id: orderId, email_sent_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );

    return res.status(200).json({ success: true, id: data?.id || null, email });
  } catch (err) {
    console.error("send-inspection error:", err);
    return res.status(500).json({ error: err.message });
  }
}
