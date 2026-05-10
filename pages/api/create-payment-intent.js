import Stripe from "stripe";
import { supabase } from "../../lib/supabase";

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
    } = req.body;

    if (!email || !address || !city || !state || !zip) {
      return res.status(400).json({ error: "Missing required customer/address fields" });
    }

    // Stage 1 charge: $25 deposit only. Delivery fee is recorded but charged at stage 2.
    const depositCents = DEPOSIT_CENTS;
    const deliveryFeeCents = Math.max(0, Math.round(Number(deliveryFee) || 0)) * 100;

    // Normalize mode: Framer cart may not send "mode", infer from months
    const normalized = items.map((i) => ({
      ...i,
      mode: i.mode || (Number(i.months) > 0 ? "rent" : "buy-new"),
    }));

    // Compute future-billing amounts so stage 2 can read them straight from the DB.
    const rentalMonthlyCents = normalized
      .filter((i) => i.mode === "rent")
      .reduce((sum, i) => sum + Math.round(Number(i.price) || 0) * 100, 0);
    const buyTotalCents = normalized
      .filter((i) => i.mode === "buy-new")
      .reduce((sum, i) => sum + Math.round(Number(i.price) || 0) * 100, 0);

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
        price_cents: Math.round(Number(i.price) || 0) * 100,
        excluded: Array.isArray(i.excluded) ? i.excluded : [],
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) throw new Error(`order_items insert: ${itemsErr.message}`);
    }

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount: depositCents,
      orderId: order.id,
    });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    res.status(500).json({ error: err.message });
  }
}
