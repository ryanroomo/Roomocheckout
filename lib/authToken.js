import crypto from "crypto";

/**
 * Signed, expiring portal tokens for the order-confirmation email link.
 *
 * The old token was base64(email) — trivially forgeable, so anyone could view
 * (or claim a session for) any customer's orders. These tokens are HMAC-signed
 * with AUTH_TOKEN_SECRET and carry an expiry, so they cannot be forged.
 *
 * Format:  base64url(payload) + "." + base64url(HMAC_SHA256(payloadB64))
 *          payload = { e: <email>, x: <expiry epoch ms> }
 */

const SECRET = process.env.AUTH_TOKEN_SECRET || "";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function signPortalToken(email, ttlMs = DEFAULT_TTL_MS) {
  if (!SECRET) throw new Error("AUTH_TOKEN_SECRET is not set");
  const payload = JSON.stringify({ e: email, x: Date.now() + ttlMs });
  const p = b64url(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  return `${p}.${sig}`;
}

/** Returns the email if the token is valid & unexpired, else null. */
export function verifyPortalToken(token) {
  if (!SECRET || !token || typeof token !== "string") return null;
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload?.e || !payload?.x) return null;
  if (Date.now() > Number(payload.x)) return null; // expired
  return payload.e;
}
