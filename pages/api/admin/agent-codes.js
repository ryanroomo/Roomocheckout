import { supabase } from "../../../lib/supabase";

/**
 * /api/admin/agent-codes   (admin only)
 *
 * GET  → list all agent referral codes (partner starts with "agent_").
 * POST { agent, code? } → create a new agent code.
 *        - code omitted → auto-generates the next in the BKNY0x series.
 *        - all agent codes use the same mechanism: 10% off the first 3 months,
 *          any lease length / combination, once per customer, unlimited total.
 */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function verifyAdmin(req) {
  const pw = (req.headers.authorization || "").replace("Bearer ", "");
  return !!pw && (pw === process.env.ADMIN_PASSWORD || pw === process.env.ADMIN_SECRET);
}

const AGENT_DEFAULTS = {
  promo_type: "building_lease",
  discount_type: "percentage",
  discount_value: 0,
  applies_to: "first_month",
  free_month_min_lease: 999, // effectively never → always intro discount, any lease length
  bonus_free_months: 0,
  intro_discount_pct: 10,
  intro_discount_months: 3,
  per_customer_limit: 1,
  description: "10% off first 3 months (agent referral)",
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  // ── List existing agent codes ──
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("coupons")
      .select("code, partner, current_uses, active, created_at")
      .like("partner", "agent_%")
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ codes: data || [] });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { agent, code } = req.body || {};
    if (!agent || !String(agent).trim()) {
      return res.status(400).json({ error: "Agent name is required" });
    }
    const partner = "agent_" + String(agent).trim().replace(/\s+/g, "_");

    // Determine the code
    let finalCode = code ? String(code).trim().toUpperCase() : null;
    if (!finalCode) {
      // Auto-generate next in the BKNY0x series
      const { data: existing } = await supabase
        .from("coupons")
        .select("code")
        .ilike("code", "BKNY%");
      let max = 0;
      (existing || []).forEach((c) => {
        const m = /^BKNY(\d+)$/i.exec(c.code || "");
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > max) max = n;
        }
      });
      finalCode = "BKNY" + String(max + 1).padStart(2, "0");
    }

    // Don't overwrite an existing code
    const { data: dup } = await supabase
      .from("coupons")
      .select("code")
      .eq("code", finalCode)
      .maybeSingle();
    if (dup) {
      return res.status(409).json({ error: `Code ${finalCode} already exists` });
    }

    const { error: insErr } = await supabase.from("coupons").insert({
      code: finalCode,
      partner,
      ...AGENT_DEFAULTS,
    });
    if (insErr) throw new Error(insErr.message);

    return res.status(200).json({ code: finalCode, partner });
  } catch (err) {
    console.error("agent-codes error:", err);
    res.status(500).json({ error: err.message });
  }
}
