import { supabase } from "../../../lib/supabase";
import { verifyInspectionToken } from "../../../lib/authToken";

/**
 * POST /api/inspection/submit   (worker token required)
 * Body: { token, sets: { living: { photo, video }, dining: {...}, ... } }
 *
 * Records the uploaded media paths for every set on the order and marks
 * the inspection "submitted". After this, the admin reviews and clicks
 * "Send inspection" to email the customer their sign-off link.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, sets } = req.body || {};
  const auth = verifyInspectionToken(token);
  if (!auth || auth.role !== "worker") {
    return res.status(401).json({ error: "This link is invalid or has expired." });
  }
  if (!sets || typeof sets !== "object") return res.status(400).json({ error: "sets is required" });

  try {
    // The order's real sets — every one must have a photo + video,
    // and every path must live under this order's storage folder.
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("set_type")
      .eq("order_id", auth.orderId);
    if (itemsErr) throw new Error(itemsErr.message);

    const required = [...new Set((items || []).map((i) => String(i.set_type).toLowerCase()))];
    const media = {};
    for (const setType of required) {
      const m = sets[setType];
      if (!m || !m.photo || !m.video) {
        return res.status(400).json({ error: `Missing photo or video for ${setType}` });
      }
      if (!String(m.photo).startsWith(`${auth.orderId}/`) || !String(m.video).startsWith(`${auth.orderId}/`)) {
        return res.status(400).json({ error: "Media path does not belong to this order" });
      }
      media[setType] = { photo: m.photo, video: m.video };
    }

    // Keep "confirmed" if the customer somehow already signed.
    const { data: existing } = await supabase
      .from("inspections")
      .select("status")
      .eq("order_id", auth.orderId)
      .maybeSingle();

    const { error } = await supabase.from("inspections").upsert(
      {
        order_id: auth.orderId,
        media,
        status: existing?.status === "confirmed" ? "confirmed" : "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    );
    if (error) throw new Error(error.message);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("inspection submit error:", err);
    return res.status(500).json({ error: err.message });
  }
}
