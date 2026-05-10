import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  // CORS — same as create-payment-intent
  const origin = req.headers.origin || "";
  const allowed = ["https://roomonyc.com", "https://www.roomonyc.com"];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Slots are blocked by:
    //   - any committed order (deposit_paid / balance_charged / delivered)
    //   - recently-created pending orders (< 30 min) — gives the user time to finish
    //     payment without instantly hogging the slot for everyone else.
    // Older pending orders (abandoned checkouts) are ignored so their slots free up.
    const PENDING_TTL_MIN = 30;
    const cutoff = new Date(
      Date.now() - PENDING_TTL_MIN * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from("orders")
      .select("delivery_date, delivery_slot")
      .or(
        `status.in.(deposit_paid,balance_charged,delivered),and(status.eq.pending,created_at.gte.${cutoff})`
      )
      .not("delivery_date", "is", null)
      .not("delivery_slot", "is", null);

    if (error) throw error;

    const slots = data
      .map((row) => {
        // delivery_slot is "9 AM – 1 PM" or "2 PM – 6 PM" → "am" / "pm"
        const period = String(row.delivery_slot).trim().startsWith("9") ? "am" : "pm";
        return `${row.delivery_date}-${period}`;
      })
      .filter(Boolean);

    res.status(200).json({ slots });
  } catch (err) {
    console.error("booked-slots error:", err);
    res.status(500).json({ error: err.message });
  }
}
