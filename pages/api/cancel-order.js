import Stripe from "stripe";
import { supabase } from "../../lib/supabase";
import { sendCancellationEmail } from "../../lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// CORS
function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = [
    "https://roomonyc.com",
    "https://www.roomonyc.com",
    "https://checkout.roomonyc.com",
  ];
  if (
    allowed.some((a) => origin.startsWith(a)) ||
    origin.includes("framer") ||
    origin.includes("localhost")
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    // Decode email from token
    let email;
    try {
      email = Buffer.from(token, "base64").toString("utf-8");
    } catch {
      return res.status(400).json({ error: "Invalid token" });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid token" });
    }

    // Find customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, email, name")
      .eq("email", email)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Find most recent cancellable order (deposit_paid or pending)
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_id", customer.id)
      .in("status", ["deposit_paid", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) throw new Error(`fetch order: ${orderErr.message}`);

    if (!order) {
      return res.status(400).json({ error: "No cancellable order found" });
    }

    // ── Refund deposit via Stripe ────────────────────────────
    let refunded = false;
    if (order.stripe_payment_intent_id && order.status === "deposit_paid") {
      try {
        await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
        });
        refunded = true;
      } catch (refundErr) {
        console.error("Stripe refund error:", refundErr.message);
        // If refund fails (e.g. already refunded), continue with cancellation
        if (refundErr.code === "charge_already_refunded") {
          refunded = true;
        } else {
          return res.status(500).json({
            error: "Refund failed. Please contact support@roomonyc.com",
          });
        }
      }
    }

    // ── Release pre-auth hold if present ────────────────────
    if (order.stripe_auth_pi_id) {
      try {
        await stripe.paymentIntents.cancel(order.stripe_auth_pi_id);
      } catch (authErr) {
        console.error("Cancel pre-auth error (non-fatal):", authErr.message);
      }
    }

    // ── Update order status ──────────────────────────────────
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    // ── Record cancellation in payments ledger ───────────────
    if (refunded) {
      await supabase.from("payments").insert({
        order_id: order.id,
        type: "refund",
        amount_cents: order.deposit_cents || 2500,
        stripe_payment_intent_id: order.stripe_payment_intent_id,
        status: "succeeded",
        description: "Deposit refunded — order cancelled by customer",
      });
    }

    // ── Send cancellation confirmation email ─────────────────
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

    res.status(200).json({
      success: true,
      refunded,
      message: refunded
        ? "Order cancelled and deposit refunded."
        : "Order cancelled.",
    });
  } catch (err) {
    console.error("cancel-order error:", err);
    res.status(500).json({ error: err.message });
  }
}
