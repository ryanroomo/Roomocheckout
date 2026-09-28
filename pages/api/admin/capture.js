import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/capture
 *
 * Called when delivery is confirmed. Does three things:
 *   1. Captures the pre-authorized PaymentIntent
 *      — or, if the auth expired (e.g. delivery was rescheduled past
 *        Stripe's 7-day hold window), charges the saved card fresh.
 *      — or, if the money was already collected (manual re-charge in the
 *        Stripe Dashboard, or a previous partial run), skips charging.
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
    // Normal path: "authorized". Also allow re-running on an order that got
    // stuck halfway (e.g. money collected manually but no subscription yet):
    // status "delivered" with no subscription on file.
    const isRerun =
      order.status === "delivered" && !order.stripe_subscription_id;
    if (order.status !== "authorized" && !isRerun) {
      return res.status(400).json({
        error: `Order status is "${order.status}", expected "authorized" (or "delivered" without a subscription for a re-run)`,
      });
    }
    if (!order.stripe_auth_pi_id) {
      return res.status(400).json({ error: "No pre-auth PaymentIntent on order" });
    }

    const isRental = order.rental_monthly_cents > 0;

    // 2. Collect the money — capture, fresh charge, or skip if already paid.
    //
    // First check the ledger: if a succeeded capture/charge already exists for
    // this order (e.g. admin re-charged manually in the Stripe Dashboard after
    // the auth expired), do NOT charge again.
    const { data: priorCaptures } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, amount_cents")
      .eq("order_id", order.id)
      .in("type", ["pre_auth_capture", "buy_capture"])
      .eq("status", "succeeded")
      .limit(1);
    const priorCapture = priorCaptures && priorCaptures[0];

    let capturedPiId = null;

    if (priorCapture) {
      // Money already collected — skip straight to subscription/status.
      capturedPiId = priorCapture.stripe_payment_intent_id;
    } else {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_auth_pi_id);

      if (pi.status === "requires_capture") {
        // Normal path: capture the hold
        const captured = await stripe.paymentIntents.capture(pi.id);
        capturedPiId = captured.id;

        await supabase
          .from("payments")
          .update({ status: "succeeded" })
          .eq("stripe_payment_intent_id", order.stripe_auth_pi_id)
          .eq("type", "pre_auth");
      } else if (pi.status === "succeeded") {
        // Hold was already captured (e.g. via Dashboard) — don't charge again
        capturedPiId = pi.id;

        await supabase
          .from("payments")
          .update({ status: "succeeded" })
          .eq("stripe_payment_intent_id", order.stripe_auth_pi_id)
          .eq("type", "pre_auth");
      } else if (pi.status === "canceled") {
        // Auth expired (Stripe cancels uncaptured holds after ~7 days —
        // happens when delivery is rescheduled). Charge the saved card fresh.
        if (!order.stripe_payment_method_id || !order.customers?.stripe_customer_id) {
          return res.status(400).json({
            error:
              "Pre-auth expired and no saved payment method/customer to re-charge. Charge manually in Stripe, record it in payments, then re-run.",
          });
        }
        const recharge = await stripe.paymentIntents.create({
          amount: order.authorized_amount_cents,
          currency: "usd",
          customer: order.customers.stripe_customer_id,
          payment_method: order.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Roomo re-charge after expired auth — order ${order.id.slice(0, 8)}`,
          metadata: { order_id: order.id, reason: "auth_expired" },
        });
        capturedPiId = recharge.id;

        // Mark the dead pre-auth row so the admin UI stops showing it as pending
        await supabase
          .from("payments")
          .update({
            status: "canceled",
            description: "Pre-auth expired (delivery rescheduled past 7-day window)",
          })
          .eq("stripe_payment_intent_id", order.stripe_auth_pi_id)
          .eq("type", "pre_auth");
      } else {
        return res.status(400).json({
          error: `Pre-auth PaymentIntent has status "${pi.status}" — cannot capture or re-charge automatically.`,
        });
      }

      // Record capture in ledger (only when this run actually collected money)
      await supabase.from("payments").insert({
        order_id: order.id,
        type: isRental ? "pre_auth_capture" : "buy_capture",
        amount_cents: order.authorized_amount_cents,
        stripe_payment_intent_id: capturedPiId,
        status: "succeeded",
        description: isRental
          ? `Captured: 1st month + deposit ($${(order.authorized_amount_cents / 100).toFixed(2)})`
          : `Captured: purchase ($${(order.authorized_amount_cents / 100).toFixed(2)})`,
      });
    }

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

      let promoCouponId; // Stripe coupon id to attach to the subscription (% off)
      if (
        promoCoupon &&
        promoCoupon.promo_type === "building_lease" &&
        maxMonths < (promoCoupon.free_month_min_lease || 12) &&
        Number(promoCoupon.intro_discount_pct) > 0
      ) {
        // intro_discount_months: a positive N = first N rental months; null/0 =
        // EVERY month of the lease (e.g. an employee "20% off per month" code).
        const im = Number(promoCoupon.intro_discount_months) || 0;
        const fullTerm = im <= 0;
        if (fullTerm || im > 1) {
          const introSubMonths = fullTerm
            ? remainingMonths
            : Math.min(im - 1, remainingMonths);
          if (introSubMonths > 0) {
            const stripeCoupon = await stripe.coupons.create({
              percent_off: Number(promoCoupon.intro_discount_pct),
              duration: "repeating",
              duration_in_months: introSubMonths,
              name: `${order.coupon_code} ${promoCoupon.intro_discount_pct}%`,
              metadata: { order_id: order.id, code: order.coupon_code },
            });
            promoCouponId = stripeCoupon.id;
          }
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
        // Keep an existing delivered_at (set manually or by a previous partial
        // run) instead of overwriting it with today.
        delivered_at: order.delivered_at || new Date().toISOString(),
        stripe_subscription_id: subscriptionId,
        subscription_ends_at: subscriptionEndsAt,
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    res.status(200).json({
      success: true,
      orderId: order.id,
      captured: order.authorized_amount_cents,
      alreadyPaid: !!priorCapture,
      subscriptionId,
      status: finalStatus,
    });
  } catch (err) {
    console.error("capture error:", err);
    res.status(500).json({ error: err.message });
  }
}
