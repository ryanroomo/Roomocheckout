import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/capture
 *
 * Called when delivery is confirmed. Does three things:
 *   1. Captures the pre-authorized PaymentIntent
 *   2. Marks the order as "delivered"
 *   3. For rental orders: creates a Stripe Subscription for months 2+
 *
 * Body: { orderId: string }
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Accept the admin-panel password (ADMIN_PASSWORD) or a legacy ADMIN_SECRET.
function verifyAdmin(req) {
  const pw = (req.headers.authorization || "").replace("Bearer ", "");
  return (
    !!pw &&
    (pw === process.env.ADMIN_PASSWORD || pw === process.env.ADMIN_SECRET)
  );
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    // 1. Fetch order + customer
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "authorized") {
      return res.status(400).json({
        error: `Order status is "${order.status}", expected "authorized"`,
      });
    }
    if (!order.stripe_auth_pi_id) {
      return res.status(400).json({ error: "No pre-auth PaymentIntent on order" });
    }

    // 2. Capture the pre-auth
    const captured = await stripe.paymentIntents.capture(order.stripe_auth_pi_id);

    // Update payment ledger: mark pre_auth as captured
    await supabase
      .from("payments")
      .update({ status: "succeeded" })
      .eq("stripe_payment_intent_id", order.stripe_auth_pi_id)
      .eq("type", "pre_auth");

    // Record capture in ledger
    const isRental = order.rental_monthly_cents > 0;
    await supabase.from("payments").insert({
      order_id: order.id,
      type: isRental ? "pre_auth_capture" : "buy_capture",
      amount_cents: order.authorized_amount_cents,
      stripe_payment_intent_id: captured.id,
      status: "succeeded",
      description: isRental
        ? `Captured: 1st month + deposit ($${(order.authorized_amount_cents / 100).toFixed(2)})`
        : `Captured: purchase ($${(order.authorized_amount_cents / 100).toFixed(2)})`,
    });

    // 3. For rental orders: create Stripe Subscription starting month 2
    let subscriptionId = null;
    let subscriptionEndsAt = null;

    if (isRental) {
      const rentItems = order.order_items.filter((i) => i.mode === "rent");
      const maxMonths = Math.max(...rentItems.map((i) => i.months || 12));
      const remainingMonths = maxMonths - 1; // first month already paid via capture

      // Building-lease promo (if any) attached to this order.
      //  • Short lease (< threshold): the intro % off also covers subscription
      //    months 2..N via a repeating Stripe coupon. Month 1 was already
      //    discounted at capture (order.discount_cents), so subtract 1.
      //  • Long lease (≥ threshold): NO subscription discount — the reward is a
      //    free month of possession at the END, added to subscription_ends_at.
      let promoCoupon = null;
      if (order.coupon_code) {
        const { data: c } = await supabase
          .from("coupons")
          .select("*")
          .eq("code", order.coupon_code)
          .maybeSingle();
        promoCoupon = c || null;
      }

      let promoCouponId; // Stripe coupon id to attach to the subscription (intro %)
      if (
        promoCoupon &&
        promoCoupon.promo_type === "building_lease" &&
        maxMonths < (promoCoupon.free_month_min_lease || 12) &&
        (promoCoupon.intro_discount_months || 0) > 1 &&
        Number(promoCoupon.intro_discount_pct) > 0
      ) {
        const introSubMonths = Math.min(
          (promoCoupon.intro_discount_months || 0) - 1,
          remainingMonths
        );
        if (introSubMonths > 0) {
          const stripeCoupon = await stripe.coupons.create({
            percent_off: Number(promoCoupon.intro_discount_pct),
            duration: "repeating",
            duration_in_months: introSubMonths,
            name: `${order.coupon_code} intro ${promoCoupon.intro_discount_pct}%`,
            metadata: { order_id: order.id, code: order.coupon_code },
          });
          promoCouponId = stripeCoupon.id;
        }
      }

      if (remainingMonths > 0) {
        // Create a Stripe Price for this order's monthly amount
        const product = await stripe.products.create({
          name: `Roomo Monthly Rent – Order ${order.id.slice(0, 8)}`,
          metadata: { order_id: order.id },
        });

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: order.rental_monthly_cents,
          currency: "usd",
          recurring: { interval: "month" },
        });

        // Bill on CALENDAR months anchored to the delivery date. Month 1 is the
        // delivery month (already covered by this capture), so the first
        // subscription charge is delivery + 1 month, then monthly on the same
        // day-of-month, and billing stops at delivery + maxMonths months. This
        // replaces the old "30-day multiple" math, which drifted the lease end
        // a few days early (e.g. a 9-month lease ended on day 270 ≈ 8.9 months).
        const nowTs = Math.floor(Date.now() / 1000);
        const deliveryPlusMonths = (n) => {
          if (order.delivery_date) {
            const d = new Date(order.delivery_date + "T12:00:00Z");
            d.setUTCMonth(d.getUTCMonth() + n);
            return Math.floor(d.getTime() / 1000);
          }
          return nowTs + n * 30 * 24 * 60 * 60; // fallback if no delivery date on file
        };
        // First subscription charge = start of month 2 (Stripe needs it future-dated).
        let trialEnd = deliveryPlusMonths(1);
        if (trialEnd <= nowTs) trialEnd = nowTs + 60;
        // Billing stops after month maxMonths.
        const cancelAt = deliveryPlusMonths(maxMonths);

        const subscription = await stripe.subscriptions.create({
          customer: order.customers.stripe_customer_id,
          items: [{ price: price.id }],
          // Intro % off for the remaining discounted months (short-lease promo).
          ...(promoCouponId ? { coupon: promoCouponId } : {}),
          default_payment_method: order.stripe_payment_method_id,
          trial_end: trialEnd,
          cancel_at: cancelAt,
          metadata: {
            order_id: order.id,
            monthly_cents: String(order.rental_monthly_cents),
            total_months: String(maxMonths),
          },
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          // Retry up to 3 times on failure
          collection_method: "charge_automatically",
        });

        subscriptionId = subscription.id;

        // Free month(s) at the END of the lease: extra possession WITHOUT extra
        // billing (cancel_at above already stops charges). Lease-end target is
        // delivery + (maxMonths + bonus) calendar months.
        const bonusMonths = order.bonus_free_months || 0;
        const endTs = deliveryPlusMonths(maxMonths + bonusMonths);
        subscriptionEndsAt = new Date(endTs * 1000).toISOString();
      }
    }

    // 4. Update order status
    // For 1-month rentals (no subscription needed), go straight to "completed"
    let finalStatus;
    if (!isRental) {
      finalStatus = "delivered"; // buy order — done after delivery
    } else if (subscriptionId) {
      finalStatus = "active";   // multi-month rental — subscription running
    } else {
      finalStatus = "completed"; // 1-month rental — first month already paid, no more charges
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: finalStatus,
        delivered_at: new Date().toISOString(),
        stripe_subscription_id: subscriptionId,
        subscription_ends_at: subscriptionEndsAt,
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    res.status(200).json({
      success: true,
      orderId: order.id,
      captured: order.authorized_amount_cents,
      subscriptionId,
      status: finalStatus,
    });
  } catch (err) {
    console.error("capture error:", err);
    res.status(500).json({ error: err.message });
  }
}
