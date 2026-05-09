import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  // CORS: allow roomonyc.com and framer preview domains
  const origin = req.headers.origin || "";
  const allowed = [
    "https://roomonyc.com",
    "https://www.roomonyc.com",
  ];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      items,
      email,
      name,
      phone,
      address,
      city,
      state,
      zip,
      deliveryDate,
      deliverySlot,
      deliveryFee = 0,
    } = req.body;

    // For now: charge a $25 refundable deposit
    const depositCents = 2500;
    const deliveryFeeCents = (deliveryFee || 0) * 100;
    const totalCents = depositCents + deliveryFeeCents;

    // Create or find customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        name,
        phone,
        address: { line1: address, city, state, postal_code: zip, country: "US" },
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      customer: customer.id,
      metadata: {
        items: JSON.stringify(items),
        deliveryDate: deliveryDate || "",
        deliverySlot: deliverySlot || "",
        deliveryFee: String(deliveryFee),
        depositAmount: "25",
      },
      receipt_email: email,
      description: `Roomo deposit – ${items.length} set(s)`,
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
      customerId: customer.id,
    });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
}
