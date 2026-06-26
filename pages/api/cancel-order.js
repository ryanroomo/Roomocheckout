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

    // Find most recent cancellable order (pending, deposit_paid, or authorized)
    const cancellable = ["pending", "deposit_paid", "authorized"];
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_id", customer.id)
      .in("status", cancellable)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) throw new Error(`fetch order: ${orderErr.message}`);

    if (!order) {
      return res.status(400).json({ error: "No cancellable order found" });
    }

    // ── Enforce refund deadline (48h before delivery) ────────
    // Pending orders can always be cancelled (no payment yet).
    // Paid/authorized orders must be cancelled before the refund deadline.
    if (order.status !== "pending" && order.refund_deadline) {
      const deadline = new Date(order.refund_deadline);
      if (new Date() >= deadline) {
        return res.status(400).json({
          error:
            "The cancellation window has closed (48 hours before delivery). Please contact hello@roomonyc.com for assistance.",
        });
      }
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

    // ── Update order status (with optimistic lock) ─────────────
    const { error: updateErr, count: updateCount } = await supabase
      .from("orders")
      .update(
        {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        },
        { count: "exact" }
      )
      .eq("id", order.id)
      .in("status", cancellable);

    if (!updateErr && updateCount === 0) {
      return res.status(409).json({
        error: "Order status changed — please refresh and try again.",
      });
    }

    if (updateErr) throw new Error(`update order: ${updateErr.message}`);

    // ── Release pre-auth hold if present ────────────────────
    // Re-fetch to get the latest stripe_auth_pi_id in case the cron
    // added one between our initial fetch and the status update above.
    const { data: freshOrder } = await supabase
      .from("orders")
      .select("stripe_auth_pi_id")
      .eq("id", order.id)
      .single();

    const authPiId = freshOrder?.stripe_auth_pi_id || order.stripe_auth_pi_id;
    if (authPiId) {
      try {
        await stripe.paymentIntents.cancel(authPiId);
      } catch (authErr) {
        console.error("Cancel pre-auth error (non-fatal):", authErr.message);
      }
    }

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
