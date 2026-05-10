import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

/**
 * POST /api/admin/buyout
 *
 * Rent-to-own: customer decides to keep the furniture.
 *
 * Buyout price = brand-new purchase price
 *              − total rent already paid
 *              − security deposit (applied toward purchase)
 *
 * Steps:
 *   1. Calculate buyout amount
 *   2. Charge the difference via saved card
 *   3. Cancel the Stripe Subscription
 *   4. Update order: status → "delivered" (owned, no return needed)
 *
 * Body: { orderId: string }
 *
 * GET /api/admin/buyout?orderId=xxx
 *   → returns the buyout quote without charging
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

// ── Price tables (must match Framer RoomoCart.tsx) ────────────

function calcBuyPrice(setType, monthlyCents) {
  // Buy price = 12-month tier (lowest) monthly × 13
  const BASE_12MO = {
    living: 349_00,
    dining: 249_00,
    bedding: 199_00,
  };
  const base = BASE_12MO[setType];
  if (base) return base * 13;
  return monthlyCents * 13;
}

// ── Calculate buyout ─────────────────────────────────────────

async function calculateBuyout(order) {
  // Sum up all rent paid so far (successful subscription + capture payments)
  const { data: payments } = await supabase
    .from("payments")
    .select("amount_cents, type, status")
    .eq("order_id", order.id)
    .eq("status", "succeeded");

  const totalPaid = (payments || []).reduce((sum, p) => {
    // Count: deposit, pre_auth_capture, subscription payments
    if (["deposit", "pre_auth_capture", "subscription"].includes(p.type)) {
      return sum + p.amount_cents;
    }
    return sum;
  }, 0);

  // Get buy prices for each rental item
  const rentItems = (order.order_items || []).filter((i) => i.mode === "rent");
  const totalBuyPrice = rentItems.reduce(
    (sum, item) => sum + calcBuyPrice(item.set_type, item.price_cents),
    0
  );

  // Security deposit counts toward purchase
  const securityDeposit = order.security_deposit_cents || 0;

  // Buyout = buy price − everything already paid (rent + deposit + security)
  const buyoutAmount = Math.max(0, totalBuyPrice - totalPaid - securityDeposit);

  return {
    totalBuyPrice,
    totalPaid,
    securityDeposit,
    buyoutAmount,
    rentItems: rentItems.map((i) => ({
      setType: i.set_type,
      buyPrice: calcBuyPrice(i.set_type, i.price_cents),
    })),
  };
}

export default async function handler(req, res) {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ── GET: quote only ──────────────────────────────────────────
  if (req.method === "GET") {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();

    if (error || !order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "active") {
      return res.status(400).json({
        error: `Order status is "${order.status}", buyout only available for active rentals`,
      });
    }

    const quote = await calculateBuyout(order);
    return res.status(200).json({ orderId, ...quote });
  }

  // ── POST: execute buyout ─────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  try {
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("*, customers(*), order_items(*)")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "active") {
      return res.status(400).json({
        error: `Order status is "${order.status}", buyout only available for active rentals`,
      });
    }

    const quote = await calculateBuyout(order);

    // 1. Charge the buyout amount
    let buyoutPI = null;
    if (quote.buyoutAmount > 0) {
      buyoutPI = await stripe.paymentIntents.create({
        amount: quote.buyoutAmount,
        currency: "usd",
        customer: order.customers.stripe_customer_id,
        payment_method: order.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        metadata: {
          order_id: order.id,
          type: "buyout",
        },
        description: `Roomo buyout – Order ${order.id.slice(0, 8)}`,
      });

      // Record in payments ledger
      await supabase.from("payments").insert({
        order_id: order.id,
        type: "buyout",
        amount_cents: quote.buyoutAmount,
        stripe_payment_intent_id: buyoutPI.id,
        status: "succeeded",
        description: `Buyout: $${(quote.buyoutAmount / 100).toFixed(2)} (buy price $${(quote.totalBuyPrice / 100).toFixed(2)} − $${(quote.totalPaid / 100).toFixed(2)} paid − $${(quote.securityDeposit / 100).toFixed(2)} deposit)`,
      });
    }

    // 2. Cancel the subscription
    if (order.stripe_subscription_id) {
      await stripe.subscriptions.cancel(order.stripe_subscription_id);
    }

    // 3. Update order — now it's a purchase, no return needed
    await supabase
      .from("orders")
      .update({
        status: "delivered",
        buy_total_cents: quote.totalBuyPrice,
        stripe_subscription_id: null,
        subscription_ends_at: null,
      })
      .eq("id", order.id);

    res.status(200).json({
      success: true,
      orderId: order.id,
      charged: quote.buyoutAmount,
      buyoutPaymentIntentId: buyoutPI?.id || null,
      breakdown: quote,
    });
  } catch (err) {
    console.error("buyout error:", err);
    res.status(500).json({ error: err.message });
  }
}
