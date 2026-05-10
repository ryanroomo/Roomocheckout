import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/complete-return
 *
 * Called after furniture is picked up. Marks order as "completed"
 * and optionally refunds the security deposit (full or partial).
 *
 * Body: {
 *   orderId: string,
 *   refundDeposit: boolean,         // whether to refund security deposit
 *   deductionCents?: number         // damage deduction (subtracted from deposit)
 * }
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

  const { orderId, refundDeposit = true, deductionCents = 0 } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*, customers(*)")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "return_scheduled") {
      return res.status(400).json({
        error: `Order status is "${order.status}", expected "return_scheduled"`,
      });
    }

    // Refund security deposit if applicable
    let refundAmount = 0;
    if (refundDeposit && order.security_deposit_cents > 0) {
      refundAmount = Math.max(0, order.security_deposit_cents - deductionCents);

      if (refundAmount > 0) {
        // Refund via the captured pre-auth PaymentIntent
        const piId = order.stripe_auth_pi_id;
        if (piId) {
          await stripe.refunds.create({
            payment_intent: piId,
            amount: refundAmount,
          });

          await supabase.from("payments").insert({
            order_id: order.id,
            type: "refund",
            amount_cents: -refundAmount,
            stripe_payment_intent_id: piId,
            status: "succeeded",
            description: deductionCents > 0
              ? `Security deposit refund: $${(refundAmount / 100).toFixed(2)} (after $${(deductionCents / 100).toFixed(2)} deduction)`
              : `Security deposit refund: $${(refundAmount / 100).toFixed(2)}`,
          });
        }
      }
    }

    // Mark completed
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "completed",
        return_completed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateErr) throw new Error(`update: ${updateErr.message}`);

    res.status(200).json({
      success: true,
      orderId,
      depositRefunded: refundAmount,
      deduction: deductionCents,
    });
  } catch (err) {
    console.error("complete-return error:", err);
    res.status(500).json({ error: err.message });
  }
}
