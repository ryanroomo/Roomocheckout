import { supabase } from "../../lib/supabase";

/**
 * POST /api/price-lock   (public — called from the Framer cart's ZIP step)
 * Body: { email, moveMonth?, source? }
 *
 * "Moving to NYC and don't have your ZIP yet?" — locks today's pricing
 * for 30 days for this email (price only, never inventory) and stores
 * the lead in the price_locks table. Re-submitting refreshes the lock.
 */

export default async function handler(req, res) {
  // CORS — same pattern as newsletter-subscribe (roomonyc.com + Framer previews)
  const origin = req.headers.origin || "";
  const allowed = ["https://roomonyc.com", "https://www.roomonyc.com"];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, moveMonth, source } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }

  try {
    const lockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { error } = await supabase.from("price_locks").upsert(
      {
        email: email.toLowerCase().trim(),
        move_month: (moveMonth || "").trim() || null,
        source: (source || "zip_step").trim(),
        locked_until: lockedUntil.toISOString(),
      },
      { onConflict: "email" }
    );
    if (error) throw error;

    const lockedUntilText = lockedUntil.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return res.status(200).json({ ok: true, lockedUntil: lockedUntilText });
  } catch (err) {
    console.error("price-lock error:", err);
    return res.status(500).json({ error: err.message });
  }
}
