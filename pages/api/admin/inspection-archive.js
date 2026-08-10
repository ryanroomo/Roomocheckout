import { supabase } from "../../../lib/supabase";

/**
 * GET /api/admin/inspection-archive?orderId=...   (admin only)
 *
 * Everything stored for one order's virtual inspection, with fresh
 * signed URLs (7 days) into the private "inspections" bucket:
 * per-set photo + walkthrough video, the customer's signature PNG,
 * and the full timeline (submitted / email sent / confirmed + name
 * + device info). Powers the "View archive" modal in the admin panel.
 */

const SET_NAMES = {
  living: "Living Room Set",
  dining: "Dining Set",
  bedding: "Bedroom Set",
};

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function verifyAdmin(req) {
  const pw = (req.headers.authorization || "").replace("Bearer ", "");
  return !!pw && (pw === process.env.ADMIN_PASSWORD || pw === process.env.ADMIN_SECRET);
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("inspections")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    console.error("archive signedUrl error:", path, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inspection) {
      return res.status(404).json({ error: "No inspection exists for this order yet." });
    }

    const sets = [];
    for (const [setType, m] of Object.entries(inspection.media || {})) {
      sets.push({
        setType,
        name: SET_NAMES[setType] || setType,
        photoUrl: await signedUrl(m.photo),
        videoUrl: await signedUrl(m.video),
      });
    }

    return res.status(200).json({
      status: inspection.status,
      submittedAt: inspection.submitted_at,
      emailSentAt: inspection.email_sent_at,
      confirmedAt: inspection.confirmed_at,
      confirmedName: inspection.confirmed_name,
      userAgent: inspection.confirm_user_agent,
      sets,
      signatureUrl: await signedUrl(inspection.signature_path),
    });
  } catch (err) {
    console.error("inspection-archive error:", err);
    return res.status(500).json({ error: err.message });
  }
}
