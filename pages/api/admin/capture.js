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

// Simple admin auth — check a shared secret.
// Replace with proper auth (e.g. Supabase Auth, session token) in production.
function verifyAdmin(req) {
  if (process.env.ADMIN_SECRET) {
    return req.headers.authorization === `Bearer ${process.env.ADMIN_SECRET}`;
  }
  return process.env.NODE_ENV !== "production";
}

export default async function handler(req, res) {
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

        // Start billing in 30 days (first month already covered)
        const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        // Auto-cancel after remaining months
        const cancelAt = Math.floor(Date.now() / 1000) + maxMonths * 30 * 24 * 60 * 60;

        const subscription = await stripe.subscriptions.create({
          customer: order.customers.stripe_customer_id,
          items: [{ price: price.id }],
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
        subscriptionEndsAt = new Date(cancelAt * 1000).toISOString();
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
