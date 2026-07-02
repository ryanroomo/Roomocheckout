import Stripe from "stripe";
import { supabase } from "../../lib/supabase";
import { sendOrderConfirmation } from "../../lib/email";
import { sendAlert } from "../../lib/notify";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe needs the raw request body to verify signatures.
export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).send("webhook secret missing");
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // ── Deposit payment ────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object;

        // Ignore pre-auth captures (those are handled by admin/capture)
        if (pi.capture_method === "manual") break;

        const paymentMethodId =
          typeof pi.payment_method === "string" ? pi.payment_method : null;

        // Set refund_deadline = delivery_date − 48h
        const { data: order } = await supabase
          .from("orders")
          .select("id, delivery_date, customer_id, coupon_code")
          .eq("stripe_payment_intent_id", pi.id)
          .single();

        const updates = {
          status: "deposit_paid",
          stripe_payment_method_id: paymentMethodId,
        };

        if (order?.delivery_date) {
          updates.refund_deadline = new Date(
            new Date(order.delivery_date).getTime() - 48 * 60 * 60 * 1000
          ).toISOString();
        }

        // Idempotent transition: only the first pending/failed → deposit_paid
        // move runs the side effects (ledger, coupon usage, email). Stripe can
        // re-deliver the same event, so we guard on status to avoid double work
        // (e.g. two confirmation emails, or double-counting a coupon).
        const { data: updatedRows, error } = await supabase
          .from("orders")
          .update(updates)
          .eq("stripe_payment_intent_id", pi.id)
          .in("status", ["pending", "failed"])
          .select("id");
        if (error) throw error;

        const isFirstTransition = (updatedRows || []).length > 0;

        // Record deposit in payments ledger
        if (order && isFirstTransition) {
          await supabase.from("payments").insert({
            order_id: order.id || undefined,
            type: "deposit",
            amount_cents: pi.amount,
            stripe_payment_intent_id: pi.id,
            status: "succeeded",
            description: `$25 deposit paid`,
          });

          // Count coupon usage now that money has actually moved. A unique
          // (coupon_id, customer_id) row keeps this idempotent AND enforces the
          // per-customer limit. This is the fix for usage being consumed by
          // failed/abandoned checkouts.
          if (order.coupon_code && order.customer_id) {
            try {
              const { data: coupon } = await supabase
                .from("coupons")
                .select("id, current_uses")
                .eq("code", order.coupon_code)
                .maybeSingle();
              if (coupon) {
                const { data: redemption } = await supabase
                  .from("coupon_redemptions")
                  .upsert(
                    {
                      coupon_id: coupon.id,
                      customer_id: order.customer_id,
                      order_id: order.id,
                    },
                    { onConflict: "coupon_id,customer_id", ignoreDuplicates: true }
                  )
                  .select("id");
                // Only bump the counter when a NEW redemption row was inserted.
                if (redemption && redemption.length > 0) {
                  await supabase
                    .from("coupons")
                    .update({ current_uses: (coupon.current_uses || 0) + 1 })
                    .eq("id", coupon.id);
                }
              }
            } catch (couponErr) {
              console.error("Coupon usage count failed (non-fatal):", couponErr);
            }
          }

          // Fetch full order once for the confirmation email + founder alert
          let fullOrder = null;
          try {
            const { data } = await supabase
              .from("orders")
              .select("*, order_items(*), customers(*)")
              .eq("id", order.id)
              .single();
            fullOrder = data;
          } catch (fetchErr) {
            console.error("Fetch full order (non-fatal):", fetchErr);
          }

          // Send confirmation email to customer
          if (fullOrder?.customers?.email) {
            try {
              await sendOrderConfirmation({
                email: fullOrder.customers.email,
                name: fullOrder.customers.name,
                order: fullOrder,
                items: fullOrder.order_items || [],
              });
            } catch (emailErr) {
              // Email failure should NOT block the webhook response
              console.error("Confirmation email failed (non-fatal):", emailErr);
            }
          }

          // Founder alert — a new order was just paid for.
          try {
            const src = fullOrder || {};
            const cust = src.customers || {};
            const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
            const items = (src.order_items || [])
              .map((i) => {
                const mode = i.mode === "rent" ? `${i.months}mo rent` : "buy";
                return `• ${i.set_type} (${mode}) ${money(i.price_cents)}`;
              })
              .join("\n");
            const lines = [
              `Customer: ${cust.name || "—"} (${cust.email || "—"})`,
              items || "• (items unavailable)",
              src.rental_monthly_cents ? `Monthly rent: ${money(src.rental_monthly_cents)}/mo` : undefined,
              src.buy_total_cents ? `Buy total: ${money(src.buy_total_cents)}` : undefined,
              src.coupon_code ? `Coupon: ${src.coupon_code}` : undefined,
              src.delivery_date ? `Delivery: ${src.delivery_date}${src.delivery_slot ? " · " + src.delivery_slot : ""}` : undefined,
              `Paid now: ${money(pi.amount)} deposit`,
              "Admin: https://checkout.roomonyc.com/admin.html",
            ].filter(Boolean);
            await sendAlert({ title: "🛎️ New Roomo order confirmed", lines });
          } catch (alertErr) {
            console.error("Order alert failed (non-fatal):", alertErr);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;

        const { data: failedOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_payment_intent_id", pi.id)
          .single();

        const { error } = await supabase
          .from("orders")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        if (error) throw error;

        // Record failure in payments ledger
        if (failedOrder) {
          await supabase.from("payments").insert({
            order_id: failedOrder.id,
            type: "deposit",
            amount_cents: pi.amount,
            stripe_payment_intent_id: pi.id,
            status: "failed",
            description: `Deposit payment failed: ${pi.last_payment_error?.message || "unknown error"}`,
          });
        }
        break;
      }

      // ── Subscription: monthly rent paid ────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break; // not a subscription invoice

        // Skip the first invoice if it's $0 (trial period)
        if (invoice.amount_paid === 0) break;

        // Find the order by subscription ID
        const { data: order } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_subscription_id", subId)
          .single();

        if (order) {
          await supabase.from("payments").insert({
            order_id: order.id,
            type: "subscription",
            amount_cents: invoice.amount_paid,
            stripe_invoice_id: invoice.id,
            status: "succeeded",
            description: `Monthly rent: $${(invoice.amount_paid / 100).toFixed(2)}`,
          });
        }
        break;
      }

      // ── Subscription: payment failed ───────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const { data: order } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_subscription_id", subId)
          .single();

        if (order) {
          // Record the failure
          await supabase.from("payments").insert({
            order_id: order.id,
            type: "subscription",
            amount_cents: invoice.amount_due,
            stripe_invoice_id: invoice.id,
            status: "failed",
            description: `Monthly rent failed: attempt ${invoice.attempt_count}`,
          });

          // After Stripe exhausts retries (default 3), mark delinquent
          // Stripe's smart retries will try ~3 times over ~3 weeks
          if (invoice.attempt_count >= 3) {
            await supabase
              .from("orders")
              .update({
                status: "delinquent",
                delinquent_at: new Date().toISOString(),
              })
              .eq("id", order.id);
          }
        }
        break;
      }

      // ── Subscription ended (term complete or cancelled) ────────
      case "customer.subscription.deleted": {
        const sub = event.data.object;

        const { data: order } = await supabase
          .from("orders")
          .select("id, status")
          .eq("stripe_subscription_id", sub.id)
          .single();

        if (order && order.status === "active") {
          // Normal completion — term ended
          await supabase
            .from("orders")
            .update({ status: "completed" })
            .eq("id", order.id);
        }
        // If status is "cancelled" — subscription was cancelled by admin/customer, do nothing
        // If status is already "delinquent", leave it as-is for manual review
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: err.message });
  }
}
