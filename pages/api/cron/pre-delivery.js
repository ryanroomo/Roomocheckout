import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * Cron: Pre-delivery authorization
 * Runs every hour via Vercel Cron.
 *
 * Finds orders where:
 *   - status = "deposit_paid"
 *   - delivery_date is within 48h from now
 *
 * Creates a PaymentIntent with capture_method: "manual" (pre-auth hold):
 *   - Rental: monthly_rent × 2 (first month + security deposit) − $25
 *   - Buy:    buy_total − $25
 *
 * On success → status = "authorized"
 * On failure → status = "auth_failed"
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Vercel Cron security: verify the request is from Vercel
function verifyCron(req) {
  if (process.env.CRON_SECRET) {
    return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  }
  // In development, allow without secret
  return process.env.NODE_ENV !== "production";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyCron(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Find orders that are deposit_paid and delivery is within 48h
    const { data: orders, error: fetchErr } = await supabase
      .from("orders")
      .select("*, customers(*)")
      .eq("status", "deposit_paid")
      .not("delivery_date", "is", null)
      .lte("delivery_date", in48h.toISOString().split("T")[0]);

    if (fetchErr) throw new Error(`fetch orders: ${fetchErr.message}`);

    const results = [];

    for (const order of orders || []) {
      try {
        // Determine charge amount
        const isRental = order.rental_monthly_cents > 0;
        const isBuy = order.buy_total_cents > 0 && !isRental;

        let authAmountCents;
        let securityDepositCents = 0;

        if (isRental) {
          // First month + one month security deposit − $25 deposit already paid
          securityDepositCents = order.rental_monthly_cents;
          authAmountCents =
            order.rental_monthly_cents * 2 +
            order.delivery_fee_cents -
            order.deposit_cents;
        } else if (isBuy) {
          // Full buy price + delivery fee − $25
          authAmountCents =
            order.buy_total_cents +
            order.delivery_fee_cents -
            order.deposit_cents;
        } else {
          // Mixed order: rental monthly + buy total + delivery − $25
          securityDepositCents = order.rental_monthly_cents;
          authAmountCents =
            order.rental_monthly_cents * 2 +
            order.buy_total_cents +
            order.delivery_fee_cents -
            order.deposit_cents;
        }

        // Safety: ensure amount is positive
        if (authAmountCents <= 0) {
          console.warn(`Order ${order.id}: auth amount is ${authAmountCents}, skipping`);
          continue;
        }

        // Get the saved payment method
        const paymentMethodId = order.stripe_payment_method_id;
        if (!paymentMethodId) {
          throw new Error("No saved payment method on order");
        }

        // Create pre-auth (manual capture)
        const authPI = await stripe.paymentIntents.create({
          amount: authAmountCents,
          currency: "usd",
          customer: order.customers.stripe_customer_id,
          payment_method: paymentMethodId,
          capture_method: "manual",
          confirm: true,
          off_session: true,
          metadata: {
            order_id: order.id,
            type: isRental ? "rental_preauth" : "buy_preauth",
            security_deposit_cents: String(securityDepositCents),
          },
          description: isRental
            ? `Roomo pre-auth: 1st month + deposit – delivery ${order.delivery_date}`
            : `Roomo pre-auth: purchase – delivery ${order.delivery_date}`,
        });

        // Update order
        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            status: "authorized",
            stripe_auth_pi_id: authPI.id,
            authorized_amount_cents: authAmountCents,
            security_deposit_cents: securityDepositCents,
            refund_deadline: new Date(
              new Date(order.delivery_date).getTime() - 48 * 60 * 60 * 1000
            ).toISOString(),
          })
          .eq("id", order.id);

        if (updateErr) throw new Error(`update order: ${updateErr.message}`);

        // Record in payments ledger
        await supabase.from("payments").insert({
          order_id: order.id,
          type: "pre_auth",
          amount_cents: authAmountCents,
          stripe_payment_intent_id: authPI.id,
          status: "pending", // not yet captured
          description: `Pre-auth hold: $${(authAmountCents / 100).toFixed(2)}`,
        });

        results.push({ orderId: order.id, status: "authorized", amount: authAmountCents });
      } catch (orderErr) {
        console.error(`Pre-auth failed for order ${order.id}:`, orderErr);

        // Mark order as auth_failed
        await supabase
          .from("orders")
          .update({ status: "auth_failed" })
          .eq("id", order.id);

        // Record the failure
        await supabase.from("payments").insert({
          order_id: order.id,
          type: "pre_auth",
          amount_cents: 0,
          status: "failed",
          description: `Pre-auth failed: ${orderErr.message}`,
        });

        results.push({ orderId: order.id, status: "auth_failed", error: orderErr.message });
      }
    }

    res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("pre-delivery cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
