import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";
import { sendCancellationEmail } from "../../../lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

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

  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    // Fetch the order with customer info
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*), customers(*)")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow cancelling certain statuses
    const cancellable = ["pending", "deposit_paid", "authorized"];
    if (!cancellable.includes(order.status)) {
      return res.status(400).json({
        error: `Cannot cancel order with status "${order.status}". Only pending, deposit_paid, and authorized orders can be cancelled.`,
      });
    }

    // ── Refund deposit via Stripe ────────────────────────────
    let refunded = false;
    if (order.stripe_payment_intent_id && order.status !== "pending") {
      try {
        await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
        });
        refunded = true;
      } catch (refundErr) {
        console.error("Stripe refund error:", refundErr.message);
        if (refundErr.code === "charge_already_refunded") {
          refunded = true;
        } else {
          return res.status(500).json({
            error: "Stripe refund failed: " + refundErr.message,
          });
        }
      }
    }

    // ── Release pre-auth hold if authorized ─────────────────
    if (order.status === "authorized" && order.stripe_auth_pi_id) {
      try {
        await stripe.paymentIntents.cancel(order.stripe_auth_pi_id);
      } catch (authErr) {
        console.error("Cancel pre-auth error (non-fatal):", authErr.message);
        // If already cancelled/captured, continue
      }
    }

    // ── Cancel Stripe Subscription if active ─────────────────
    if (order.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(order.stripe_subscription_id);
      } catch (subErr) {
        console.error("Cancel subscription error (non-fatal):", subErr.message);
      }
    }

    // ── Update order status ──────────────────────────────────
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        stripe_subscription_id: null,
        subscription_ends_at: null,
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    // ── Record in payments ledger ────────────────────────────
    if (refunded) {
      await supabase.from("payments").insert({
        order_id: order.id,
        type: "refund",
        amount_cents: order.deposit_cents || 2500,
        stripe_payment_intent_id: order.stripe_payment_intent_id,
        status: "succeeded",
        description: "Deposit refunded — order cancelled by admin",
      });
    }

    // ── Send cancellation email to customer ──────────────────
    const customer = order.customers;
    if (customer && customer.email) {
      try {
        await sendCancellationEmail({
          email: customer.email,
          name: customer.name,
          order,
          refunded,
        });
      } catch (emailErr) {
        console.error("Cancellation email failed (non-fatal):", emailErr);
      }
    }

    res.status(200).json({
      success: true,
      refunded,
      message: refunded
        ? "Order cancelled and deposit refunded."
        : "Order cancelled (no payment to refund).",
    });
  } catch (err) {
    console.error("admin cancel-order error:", err);
    res.status(500).json({ error: err.message });
  }
}
