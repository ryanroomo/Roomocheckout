import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/refund
 *
 * Refunds the $25 deposit. Only allowed before the refund_deadline
 * (48h before delivery). After that, refunds are blocked.
 *
 * Body: { orderId: string }
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

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
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only deposit_paid orders can be refunded
    if (order.status !== "deposit_paid") {
      return res.status(400).json({
        error: `Cannot refund: order status is "${order.status}". Only deposit_paid orders are refundable.`,
      });
    }

    // Check refund deadline
    if (order.refund_deadline) {
      const deadline = new Date(order.refund_deadline);
      if (new Date() >= deadline) {
        return res.status(400).json({
          error: `Refund window closed at ${deadline.toISOString()}. Less than 48h before delivery.`,
        });
      }
    }

    // Refund the original deposit PaymentIntent
    if (!order.stripe_payment_intent_id) {
      return res.status(400).json({ error: "No PaymentIntent to refund" });
    }

    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: order.deposit_cents, // $25 = 2500 cents
    });

    // Update order status
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", order.id);

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    // Record in payments ledger
    await supabase.from("payments").insert({
      order_id: order.id,
      type: "refund",
      amount_cents: -order.deposit_cents, // negative = money returned
      stripe_payment_intent_id: order.stripe_payment_intent_id,
      status: "succeeded",
      description: `Refund: $${(order.deposit_cents / 100).toFixed(2)} deposit returned`,
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      refundId: refund.id,
      refundedCents: order.deposit_cents,
    });
  } catch (err) {
    console.error("refund error:", err);
    res.status(500).json({ error: err.message });
  }
}
