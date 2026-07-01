import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  const allowed = ["https://roomonyc.com", "https://www.roomonyc.com"];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { code, cartTotal, months } = req.body || {};

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Coupon code required" });
  }

  try {
    const cleanCode = code.trim().toUpperCase();

    const { data: coupon, error: dbError } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", cleanCode)
      .maybeSingle();

    if (dbError) throw dbError;

    if (!coupon) {
      return res.status(200).json({ valid: false, reason: "Code not found" });
    }

    // Check active
    if (!coupon.active) {
      return res.status(200).json({ valid: false, reason: "Code is no longer active" });
    }

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(200).json({ valid: false, reason: "Code has expired" });
    }

    // Check start date
    if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
      return res.status(200).json({ valid: false, reason: "Code is not yet active" });
    }

    // Check usage limit
    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return res.status(200).json({ valid: false, reason: "Code has reached its usage limit" });
    }

    // Calculate discount
    const total = Number(cartTotal) || 0;
    const leaseMonths = Number(months) || 0;

    // ── Conditional building-lease promo ─────────────────────
    if (coupon.promo_type === "building_lease") {
      const threshold = coupon.free_month_min_lease || 12;
      if (leaseMonths >= threshold) {
        const n = coupon.bonus_free_months || 0;
        return res.status(200).json({
          valid: true,
          code: coupon.code,
          discountType: "bonus_month",
          discountValue: n,
          discountAmount: 0, // reward is a free month at the end, not a $ discount
          appliesTo: "bonus_month",
          description: `${n} free month${n > 1 ? "s" : ""} on your ${threshold}-month lease`,
          freeMonths: n,
        });
      }
      const pct = Number(coupon.intro_discount_pct) || 0;
      const im = coupon.intro_discount_months || 0;
      return res.status(200).json({
        valid: true,
        code: coupon.code,
        discountType: "percentage",
        discountValue: pct,
        discountAmount: Math.round(total * (pct / 100)), // per-month saving on rent
        appliesTo: "first_n_months",
        description: `${pct}% off your first ${im} month${im > 1 ? "s" : ""}`,
        introMonths: im,
      });
    }

    let discountAmount = 0;

    if (coupon.discount_type === "percentage") {
      discountAmount = Math.round(total * (coupon.discount_value / 100));
    } else {
      // fixed dollar amount
      discountAmount = Math.min(coupon.discount_value, total);
    }

    res.status(200).json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value),
      discountAmount,
      appliesTo: coupon.applies_to,
      description: coupon.description || "",
    });
  } catch (err) {
    console.error("validate-coupon error:", err);
    res.status(500).json({ error: err.message });
  }
}
