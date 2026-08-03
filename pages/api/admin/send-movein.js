import { sendEarlyMoveInEmail } from "../../../lib/email";

/**
 * POST /api/admin/send-movein  (admin only)
 * Body: { email, name? }
 * Sends the "have your home ready before you arrive" early move-in email.
 * Used for one-off manual sends today; a scheduled day-after-order flow can
 * call sendEarlyMoveInEmail() directly later.
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
    const { email, name } = req.body || {};
    if (!email || !String(email).includes("@")) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    const data = await sendEarlyMoveInEmail({
      email: String(email).trim(),
      name: (name || "").trim(),
    });
    return res.status(200).json({ success: true, id: data?.id || null });
  } catch (err) {
    console.error("send-movein error:", err);
    return res.status(500).json({ error: err.message });
  }
}
