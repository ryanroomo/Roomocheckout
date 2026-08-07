import { supabase } from "../../../lib/supabase";
import { verifyInspectionToken } from "../../../lib/authToken";

/**
 * POST /api/inspection/upload-url   (worker token required)
 * Body: { token, setType, mediaType, contentType }
 *
 * Mints a short-lived signed upload URL into the private "inspections"
 * bucket. The worker page PUTs the photo/video blob straight to storage
 * (bypasses Vercel's request-size limit), then reports the path back
 * via /api/inspection/submit.
 */

const VALID_SETS = ["living", "dining", "bedding"];
const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, setType, mediaType, contentType } = req.body || {};
  const auth = verifyInspectionToken(token);
  if (!auth || auth.role !== "worker") {
    return res.status(401).json({ error: "This link is invalid or has expired." });
  }
  if (!VALID_SETS.includes(setType)) return res.status(400).json({ error: "Bad setType" });
  if (!["photo", "video"].includes(mediaType)) return res.status(400).json({ error: "Bad mediaType" });

  try {
    const ext = EXT[contentType] || (mediaType === "photo" ? "jpg" : "webm");
    const path = `${auth.orderId}/${setType}-${mediaType}-${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("inspections")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    return res.status(200).json({ path, signedUrl: data.signedUrl });
  } catch (err) {
    console.error("upload-url error:", err);
    return res.status(500).json({ error: err.message });
  }
}
