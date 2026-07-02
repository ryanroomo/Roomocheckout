import { signPortalToken } from "../../../lib/authToken";

/**
 * POST /api/admin/portal-link   { email }
 *
 * Admin-only. Returns a signed portal link for any email:
 *   - loginLink: opens account.html and starts the real customer flow
 *     (claim → session → "set password / Google" onboarding). For testing login.
 *   - viewLink:  same but read-only ("view as customer") — real data loads,
 *     but all actions are disabled.
 */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function verifyAdmin(req) {
  const auth = req.headers.authorization || "";
  const pw = auth.replace("Bearer ", "");
  return pw && pw === process.env.ADMIN_PASSWORD;
}

export default function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  const { email } = req.body || {};
  if (!email || !String(email).includes("@")) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  const clean = String(email).trim();

  let token;
  try {
    token = signPortalToken(clean);
  } catch {
    return res.status(500).json({ error: "AUTH_TOKEN_SECRET is not set" });
  }

  const base = "https://checkout.roomonyc.com/account.html";
  const q = "?token=" + encodeURIComponent(token);
  res.status(200).json({
    email: clean,
    loginLink: base + q,
    viewLink: base + q + "&readonly=1",
  });
}
