import { supabase } from "../../../lib/supabase";
import { sendInspectionEmail } from "../../../lib/email";

/**
 * POST /api/admin/send-inspection  (admin only)
 * Body: { orderId }
 *
 * Sends the "your delivery is complete — review your virtual inspection"
 * email to the customer on the order. Used after an early-setup (remote)
 * delivery, once the workers have uploaded their inspection photos/videos.
 * On-site deliveries don't need this — the worker hands the customer the
 * on-site confirmation form directly.
 */

const SET_NAMES = {
  living: "Living Room Set",
  dining: "Dining Set",
  bedding: "Bedroom Set",
  bedroom: "Bedroom Set",
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

// "August 12, 2026 at 5:00 PM" in NY time — the 48h report-by deadline,
// anchored on the actual delivery time (falls back to now if not recorded).
function deadline48h(deliveredAt) {
  const base = deliveredAt ? new Date(deliveredAt) : new Date();
  const d = new Date(base.getTime() + 48 * 60 * 60 * 1000);
  const date = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { orderId } = req.body || {};
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

    // Customer inspection link.
    // TODO BACKEND: replace the raw order id with a signed, expiring token
    // (same pattern as signPortalToken in lib/authToken.js) so the link
    // can't be guessed, and have virtual-inspection.html load the order's
    // worker photos/videos by that token.
    const base = process.env.PUBLIC_BASE_URL || "https://checkout.roomonyc.com";
    const inspectionUrl = `${base}/virtual-inspection.html?order=${encodeURIComponent(orderId)}`;

    const sets = (order.order_items || [])
      .map((i) => SET_NAMES[String(i.set_type || "").toLowerCase()] || null)
      .filter(Boolean);

    const data = await sendInspectionEmail({
      email,
      name,
      inspectionUrl,
      deadlineText: deadline48h(order.delivered_at),
      sets,
    });

    return res.status(200).json({ success: true, id: data?.id || null, email });
  } catch (err) {
    console.error("send-inspection error:", err);
    return res.status(500).json({ error: err.message });
  }
}
