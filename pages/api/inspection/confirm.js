import { supabase } from "../../../lib/supabase";
import { verifyInspectionToken } from "../../../lib/authToken";

/**
 * POST /api/inspection/confirm   (customer token required)
 * Body: { token, printedName, signatureDataUrl }
 *
 * The customer's sign-off: stores the signature PNG in the private
 * bucket, records the printed name + timestamp + device info, and
 * marks the inspection "confirmed".
 */

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } }, // signature PNG is ~10–100KB
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

  const { token, printedName, signatureDataUrl } = req.body || {};
  const auth = verifyInspectionToken(token);
  if (!auth || auth.role !== "customer") {
    return res.status(401).json({ error: "This link is invalid or has expired." });
  }

  const name = String(printedName || "").trim();
  if (!name) return res.status(400).json({ error: "Printed name is required" });

  const m = /^data:image\/png;base64,(.+)$/.exec(String(signatureDataUrl || ""));
  if (!m) return res.status(400).json({ error: "Signature is required" });

  try {
    const buf = Buffer.from(m[1], "base64");
    if (!buf.length || buf.length > 1024 * 1024) {
      return res.status(400).json({ error: "Signature image is invalid" });
    }

    const path = `${auth.orderId}/signature-${Date.now()}.png`;
    let { error: upErr } = await supabase.storage
      .from("inspections")
      .upload(path, buf, { contentType: "image/png" });
    // Self-heal missing bucket (see upload-url.js)
    if (upErr && /not exist|not found/i.test(upErr.message || "")) {
      await supabase.storage.createBucket("inspections", { public: false });
      ({ error: upErr } = await supabase.storage
        .from("inspections")
        .upload(path, buf, { contentType: "image/png" }));
    }
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabase.from("inspections").upsert(
      {
        order_id: auth.orderId,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_name: name,
        signature_path: path,
        confirm_user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      },
      { onConflict: "order_id" }
    );
    if (error) throw new Error(error.message);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("inspection confirm error:", err);
    return res.status(500).json({ error: err.message });
  }
}
