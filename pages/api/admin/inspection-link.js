import { supabase } from "../../../lib/supabase";
import { signInspectionToken } from "../../../lib/authToken";

/**
 * POST /api/admin/inspection-link   (admin only)
 * Body: { orderId, role }   role: "worker" | "customer"
 *
 * Mints a signed, expiring link for the order:
 *   worker   → worker-inspection.html  (crew capture flow)
 *   customer → virtual-inspection.html (review + sign-off)
 * Also makes sure an inspections row exists so the admin can track it.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function verifyAdmin(req) {
  const pw = (req.headers.authorization || "").replace("Bearer ", "");
  return !!pw && (pw === process.env.ADMIN_PASSWORD || pw === process.env.ADMIN_SECRET);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { orderId, role = "worker" } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "orderId is required" });
    if (!["worker", "customer", "onsite"].includes(role)) return res.status(400).json({ error: "Bad role" });

    const { data: order, error } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .single();
    if (error || !order) return res.status(404).json({ error: "Order not found" });

    // Track the inspection from the moment a worker link is created.
    await supabase
      .from("inspections")
      .upsert({ order_id: orderId }, { onConflict: "order_id", ignoreDuplicates: true });

    const token = signInspectionToken(orderId, role);
    const base = process.env.PUBLIC_BASE_URL || "https://checkout.roomonyc.com";
    // onsite = combined capture + on-the-spot sign, starts on the worker capture page
    const page = role === "customer" ? "virtual-inspection.html" : "worker-inspection.html";
    const url = `${base}/${page}?token=${encodeURIComponent(token)}`;

    return res.status(200).json({ url, role });
  } catch (err) {
    console.error("inspection-link error:", err);
    return res.status(500).json({ error: err.message });
  }
}
