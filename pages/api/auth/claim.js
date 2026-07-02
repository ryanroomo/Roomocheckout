import { supabase } from "../../../lib/supabase";
import { verifyPortalToken } from "../../../lib/authToken";

/**
 * POST /api/auth/claim   { token }
 *
 * Turns a signed order-email token into a real Supabase Auth session.
 *
 * Flow:
 *   1. Verify the signed token → the customer's email (unforgeable).
 *   2. Confirm a customer actually exists for that email.
 *   3. Mint a one-time magic-link for that email (creates the auth user if
 *      needed, with the email already confirmed) and return its token_hash.
 *   4. The browser calls supabase.auth.verifyOtp({ token_hash, type:'email' })
 *      to establish a secure session — no password required.
 *
 * After that, the customer can (optionally) set a password or link Google from
 * the portal, enabling direct logins in future.
 */
function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = [
    "https://roomonyc.com",
    "https://www.roomonyc.com",
    "https://checkout.roomonyc.com",
  ];
  if (
    allowed.some((a) => origin.startsWith(a)) ||
    origin.includes("framer") ||
    origin.includes("localhost")
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { token } = req.body || {};
    const email = verifyPortalToken(token);
    if (!email) {
      return res.status(401).json({ error: "Invalid or expired link" });
    }

    // The token proves email ownership; make sure they actually have an account.
    const { data: customer } = await supabase
      .from("customers")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();
    if (!customer) {
      return res.status(404).json({ error: "No account found for this link" });
    }

    // Mint a magic link (creates the confirmed auth user if it doesn't exist).
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw error;

    const props = data?.properties || {};
    return res.status(200).json({
      email,
      tokenHash: props.hashed_token || null,
      // Fallback: a full URL that logs the user in if token_hash exchange fails.
      actionLink: props.action_link || null,
    });
  } catch (err) {
    console.error("auth/claim error:", err);
    res.status(500).json({ error: err.message });
  }
}
