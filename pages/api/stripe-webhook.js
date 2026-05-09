import Stripe from "stripe";
import { supabase } from "../../lib/supabase";

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
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const paymentMethodId =
          typeof pi.payment_method === "string" ? pi.payment_method : null;

        const { error } = await supabase
          .from("orders")
          .update({
            status: "deposit_paid",
            stripe_payment_method_id: paymentMethodId,
          })
          .eq("stripe_payment_intent_id", pi.id);
        if (error) throw error;
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const { error } = await supabase
          .from("orders")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        if (error) throw error;
        break;
      }

      default:
        // Other events ignored for now
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: err.message });
  }
}
