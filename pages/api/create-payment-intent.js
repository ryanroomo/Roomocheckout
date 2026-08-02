import Stripe from "stripe";
import { supabase } from "../../lib/supabase";
import { signPortalToken } from "../../lib/authToken";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const DEPOSIT_CENTS = 2500; // Stage 1: always $25, regardless of cart or delivery fee

export default async function handler(req, res) {
  // CORS: allow roomonyc.com and framer preview domains
  const origin = req.headers.origin || "";
  const allowed = [
    "https://roomonyc.com",
    "https://www.roomonyc.com",
  ];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      items = [],
      email,
      name,
      phone,
      address,
      unit,
      city,
      state,
      zip,
      deliveryDate,
      deliverySlot,
      deliveryFee = 0,
      couponCode = null,
    } = req.body;

    if (!email || !address || !unit || !city || !state || !zip) {
      return res.status(400).json({ error: "Missing required customer/address fields" });
    }

    // Validate delivery date: must be at least 3 non-Sunday days from now
    if (deliveryDate) {
      const delivery = new Date(deliveryDate + "T12:00:00");
      const minDate = new Date();
      minDate.setHours(0, 0, 0, 0);
      let count = 0;
      while (count < 3) {
        minDate.setDate(minDate.getDate() + 1);
        if (minDate.getDay() !== 0) count++;
      }
      if (delivery < minDate) {
        return res.status(400).json({ error: "Delivery date must be at least 3 days from today" });
      }
    }

    // Stage 1 charge: $25 deposit only. Delivery fee is recorded but charged at stage 2.
    const depositCents = DEPOSIT_CENTS;
    const deliveryFeeCents = Math.max(0, Math.round(Number(deliveryFee) || 0)) * 100;

    // Normalize mode: Framer cart may not send "mode", infer from months
    const normalized = items.map((i) => ({
      ...i,
      mode: i.mode || (Number(i.months) > 0 ? "rent" : "buy-new"),
    }));

    // ── Auto 3-item bundle discount ──────────────────────────
    // Any 3 or more items in the cart (any sets, any rent/buy mix) get 5% off.
    // This is a permanent price cut — it applies every month for the whole
    // term — so we bake it straight into the stored amounts. That way it flows
    // through the first month, the security deposit, the monthly subscription
    // and the buyout automatically. It STACKS with coupon codes, which are
    // computed below against these already-reduced amounts (discounts compound).
    const isBundle = normalized.length >= 3;
    const bundlePct = isBundle ? 5 : 0;

    // Effective per-item price in cents, after the bundle discount.
    const itemCents = (i) =>
      Math.round((Number(i.price) || 0) * 100 * (1 - bundlePct / 100));

    // Compute future-billing amounts so stage 2 can read them straight from the DB.
    const rentalMonthlyCents = normalized
      .filter((i) => i.mode === "rent")
      .reduce((sum, i) => sum + itemCents(i), 0);
    const buyTotalCents = normalized
      .filter((i) => i.mode === "buy-new")
      .reduce((sum, i) => sum + itemCents(i), 0);

    // Longest rental term in the cart — drives the conditional building-lease promo.
    const leaseMonths = normalized
      .filter((i) => i.mode === "rent")
      .reduce((m, i) => Math.max(m, Number(i.months) || 0), 0);

    // ── Validate & record coupon if provided ────────────────
    // NOTE: usage is intentionally NOT incremented here. It is counted in the
    // Stripe webhook only when the $25 deposit is actually captured, so failed
    // or abandoned checkouts never consume a code (and never burn a customer's
    // one-time use). See stripe-webhook.js → payment_intent.succeeded.
    let validatedCoupon = null;
    let discountCents = 0;     // first-month discount, applied at the 48h pre-auth
    let bonusFreeMonths = 0;   // free month(s) granted at the END of the lease
    if (couponCode) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.trim().toUpperCase())
        .eq("active", true)
        .maybeSingle();

      if (coupon) {
        const notExpired = !coupon.expires_at || new Date(coupon.expires_at) >= new Date();
        const hasStarted = !coupon.starts_at || new Date(coupon.starts_at) <= new Date();
        const hasUses = coupon.max_uses === null || coupon.current_uses < coupon.max_uses;

        // Per-customer limit (e.g. one use per customer for public sticker codes).
        let underPerCustomerLimit = true;
        if (coupon.per_customer_limit != null) {
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (existingCustomer) {
            const { count: redeemedCount } = await supabase
              .from("coupon_redemptions")
              .select("id", { count: "exact", head: true })
              .eq("coupon_id", coupon.id)
              .eq("customer_id", existingCustomer.id);
            underPerCustomerLimit = (redeemedCount || 0) < coupon.per_customer_limit;
          }
        }

        if (notExpired && hasStarted && hasUses && underPerCustomerLimit) {
          validatedCoupon = coupon;

          if (coupon.promo_type === "building_lease") {
            // Conditional building-sticker promo.
            const threshold = coupon.free_month_min_lease || 12;
            if (leaseMonths >= threshold) {
              // Long lease → free month(s) at the END of the term.
              // First month is charged normally; the free month is extra
              // possession with no extra charge (handled in admin/capture.js).
              bonusFreeMonths = coupon.bonus_free_months || 0;
              discountCents = 0;
            } else {
              // Short lease → intro % off. Month 1 is discounted here; months
              // 2..N are discounted on the Stripe subscription in capture.js.
              const pct = Number(coupon.intro_discount_pct) || 0;
              discountCents = Math.round(rentalMonthlyCents * (pct / 100));
            }
          } else if (coupon.discount_type === "percentage") {
            discountCents = Math.round(rentalMonthlyCents * (coupon.discount_value / 100));
          } else {
            discountCents = Math.round(Number(coupon.discount_value) * 100);
          }
        }
      }
    }

    // ── 1) Stripe customer (find by email or create) ─────────
    const customers = await stripe.customers.list({ email, limit: 1 });
    let stripeCustomer;
    if (customers.data.length > 0) {
      stripeCustomer = customers.data[0];
    } else {
      stripeCustomer = await stripe.customers.create({
        email,
        name,
        phone,
        address: {
          line1: address,
          line2: unit || undefined,
          city,
          state,
          postal_code: zip,
          country: "US",
        },
      });
    }

    // ── 2) Stripe PaymentIntent ($25 only) ───────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositCents,
      currency: "usd",
      customer: stripeCustomer.id,
      // Save the card so stage 2 (48h pre-delivery) and stage 3 (monthly) can charge off-session.
      setup_future_usage: "off_session",
      metadata: {
        depositAmount: "25",
        deliveryDate: deliveryDate || "",
        deliverySlot: deliverySlot || "",
        deliveryFee: String(deliveryFee || 0),
        itemCount: String(items.length),
        couponCode: validatedCoupon ? validatedCoupon.code : "",
        discountCents: String(discountCents),
        bundleDiscountPct: String(bundlePct),
      },
      receipt_email: email,
      description: `Roomo $25 deposit – ${items.length} set(s)`,
    });

    // ── 3) Supabase: upsert customer + insert order + items ──
    const { data: dbCustomer, error: custErr } = await supabase
      .from("customers")
      .upsert(
        {
          email,
          name: name || null,
          phone: phone || null,
          stripe_customer_id: stripeCustomer.id,
        },
        { onConflict: "email" }
      )
      .select()
      .single();
    if (custErr) throw new Error(`customers upsert: ${custErr.message}`);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: dbCustomer.id,
        delivery_address: address,
        delivery_unit: unit || null,
        delivery_city: city,
        delivery_state: state,
        delivery_zip: zip,
        delivery_date: deliveryDate || null,
        delivery_slot: deliverySlot || null,
        delivery_fee_cents: deliveryFeeCents,
        deposit_cents: depositCents,
        rental_monthly_cents: rentalMonthlyCents,
        buy_total_cents: buyTotalCents,
        coupon_code: validatedCoupon ? validatedCoupon.code : null,
        discount_cents: discountCents,
        bonus_free_months: bonusFreeMonths,
        stripe_payment_intent_id: paymentIntent.id,
        status: "pending",
      })
      .select()
      .single();
    if (orderErr) throw new Error(`orders insert: ${orderErr.message}`);

    if (normalized.length > 0) {
      const rows = normalized.map((i) => ({
        order_id: order.id,
        set_type: i.set,
        mode: i.mode,
        palette: i.palette || null,
        months: Number(i.months) || 0,
        price_cents: itemCents(i),
        excluded: Array.isArray(i.excluded) ? i.excluded : [],
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) throw new Error(`order_items insert: ${itemsErr.message}`);
    }

    // Signed portal link (same one the confirmation email sends) so the
    // success screen can offer a "View / manage your order" button that works.
    let portalLink = null;
    try {
      const t = signPortalToken(email);
      portalLink = `https://checkout.roomonyc.com/account.html?token=${encodeURIComponent(t)}`;
    } catch {
      /* non-fatal: success screen just omits the button */
    }

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount: depositCents,
      orderId: order.id,
      portalLink,
      summary: {
        deliveryDate: deliveryDate || null,
        deliverySlot: deliverySlot || null,
        items: normalized.map((i) => ({
          setType: i.set,
          mode: i.mode,
          months: Number(i.months) || 0,
          priceCents: itemCents(i),
        })),
      },
    });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    res.status(500).json({ error: err.message });
  }
}
