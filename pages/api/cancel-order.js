import Stripe from "stripe";
import { supabase } from "../../lib/supabase";
import {
  sendCancellationEmail,
  sendRefundRequestNotification,
} from "../../lib/email";
import { verifyPortalToken } from "../../lib/authToken";

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

/**
 * POST /api/cancel-order   (customer, token-based)
 *
 * Customers can NO LONGER self-refund. Behaviour now depends on payment state:
 *   • pending (unpaid)          → cancelled immediately (no money moved).
 *   • deposit_paid / authorized → a refund REQUEST is filed for admin review.
 *                                 No Stripe refund, no status change. The team
 *                                 is emailed, and the 48h pre-auth cron skips
 *                                 the order while the request is pending.
 *
 * Returns { mode: 'cancelled' | 'requested' | 'already_requested' }.
 */
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token, reason } = req.body || {};

    // Resolve email, most-secure first:
    //   1. Bearer JWT (a real logged-in session)
    //   2. signed token   3. legacy base64 token
    let email = null;

    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearer) {
      const { data, error } = await supabase.auth.getUser(bearer);
      if (!error && data?.user?.email) email = data.user.email;
    }

    if (!email && token) {
      email = verifyPortalToken(token);
      if (!email) {
        try {
          const decoded = Buffer.from(token, "base64").toString("utf-8");
          if (decoded.includes("@")) email = decoded;
        } catch {
          /* ignore */
        }
      }
    }

    if (!email || !email.includes("@")) {
      return res.status(401).json({ error: "Not authenticated" });
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

    // Most recent order that can be cancelled/requested
    const actionable = ["pending", "deposit_paid", "authorized"];
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_id", customer.id)
      .in("status", actionable)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) throw new Error(`fetch order: ${orderErr.message}`);
    if (!order) {
      return res.status(400).json({ error: "No cancellable order found" });
    }

    const cleanReason =
      typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

    // ── UNPAID: cancel immediately (nothing was charged) ──────
    if (order.status === "pending") {
      const { error: updErr, count } = await supabase
        .from("orders")
        .update(
          { status: "cancelled", cancelled_at: new Date().toISOString() },
          { count: "exact" }
        )
        .eq("id", order.id)
        .eq("status", "pending");

      if (updErr) throw new Error(`update order: ${updErr.message}`);
      if (count === 0) {
        return res
          .status(409)
          .json({ error: "Order status changed — please refresh and try again." });
      }

      // Cancel the still-open (unpaid) deposit PaymentIntent, best-effort.
      if (order.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
        } catch (piErr) {
          console.error("Cancel unpaid PI (non-fatal):", piErr.message);
        }
      }

      try {
        await sendCancellationEmail({
          email: customer.email,
          name: customer.name,
          order,
          refunded: false,
        });
      } catch (emailErr) {
        console.error("Cancellation email failed (non-fatal):", emailErr);
      }

      return res.status(200).json({
        success: true,
        mode: "cancelled",
        message: "Your order has been cancelled.",
      });
    }

    // ── PAID (deposit_paid / authorized): file a refund REQUEST ──
    if (order.refund_requested_at) {
      return res.status(200).json({
        success: true,
        mode: "already_requested",
        message: "We already have your refund request and are reviewing it.",
      });
    }

    const { error: reqErr, count: reqCount } = await supabase
      .from("orders")
      .update(
        {
          refund_requested_at: new Date().toISOString(),
          refund_request_reason: cleanReason,
        },
        { count: "exact" }
      )
      .eq("id", order.id)
      .in("status", ["deposit_paid", "authorized"])
      .is("refund_requested_at", null);

    if (reqErr) throw new Error(`file request: ${reqErr.message}`);
    if (reqCount === 0) {
      // Someone/something changed it between read and write.
      return res.status(200).json({
        success: true,
        mode: "already_requested",
        message: "We already have your refund request and are reviewing it.",
      });
    }

    // Notify the team (non-fatal)
    try {
      await sendRefundRequestNotification({ order, customer, reason: cleanReason });
    } catch (emailErr) {
      console.error("Refund-request notification failed (non-fatal):", emailErr);
    }

    return res.status(200).json({
      success: true,
      mode: "requested",
      message:
        "Your refund request has been received. Our team will review and process it, and you'll get an email confirmation.",
    });
  } catch (err) {
    console.error("cancel-order error:", err);
    res.status(500).json({ error: err.message });
  }
}
