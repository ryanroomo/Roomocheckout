import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/refund
 *
 * Manual admin refund of the $25 deposit. Two uses:
 *   1. deposit_paid → standalone refund; order becomes "refunded".
 *   2. cancelled    → FALLBACK when the automatic refund during cancellation
 *                     failed (order is cancelled but the money never went back).
 *
 * Admin override: this endpoint intentionally does NOT enforce the 48h refund
 * deadline — it's the manual fallback. It is idempotent: if a refund already
 * succeeded for the order, it will not refund again.
 *
 * Body: { orderId: string }
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Same admin auth as the rest of the admin panel (ADMIN_PASSWORD).
function verifyAdmin(req) {
  const auth = req.headers.authorization || "";
  const password = auth.replace("Bearer ", "");
  return password && password === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  try {
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*, payments(*)")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });

    const allowed = ["deposit_paid", "cancelled"];
    if (!allowed.includes(order.status)) {
      return res.status(400).json({
        error: `Cannot refund an order with status "${order.status}". Allowed: deposit_paid (standalone) or cancelled (fallback).`,
      });
    }

    if (!order.stripe_payment_intent_id) {
      return res.status(400).json({ error: "No deposit PaymentIntent to refund" });
    }

    // Idempotency: never double-refund.
    const alreadyRefunded = (order.payments || []).some(
      (p) => p.type === "refund" && p.status === "succeeded"
    );
    if (alreadyRefunded) {
      if (order.status === "deposit_paid") {
        await supabase.from("orders").update({ status: "refunded" }).eq("id", order.id);
      }
      return res.status(200).json({
        success: true,
        alreadyRefunded: true,
        message: "This deposit was already refunded.",
      });
    }

    const depositCents = order.deposit_cents || 2500;

    // Issue the refund on the $25 deposit PaymentIntent.
    let refund;
    try {
      refund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: depositCents,
      });
    } catch (refundErr) {
      // Stripe says it's already fully refunded — treat as success and record it.
      if (refundErr.code === "charge_already_refunded") {
        refund = { id: null, status: "succeeded" };
      } else {
        throw refundErr;
      }
    }

    // deposit_paid → refunded; a cancelled order stays cancelled.
    if (order.status === "deposit_paid") {
      const { error: updErr } = await supabase
        .from("orders")
        .update({ status: "refunded" })
        .eq("id", order.id);
      if (updErr) throw new Error(`update order: ${updErr.message}`);
    }

    // Ledger row (negative = money returned to customer).
    await supabase.from("payments").insert({
      order_id: order.id,
      type: "refund",
      amount_cents: -depositCents,
      stripe_payment_intent_id: order.stripe_payment_intent_id,
      status: "succeeded",
      description:
        order.status === "cancelled"
          ? `Manual fallback refund: $${(depositCents / 100).toFixed(2)} deposit`
          : `Manual refund: $${(depositCents / 100).toFixed(2)} deposit returned`,
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      refundId: refund.id || null,
      refundedCents: depositCents,
      message: `Refunded $${(depositCents / 100).toFixed(2)} deposit.`,
    });
  } catch (err) {
    console.error("refund error:", err);
    res.status(500).json({ error: err.message });
  }
}
