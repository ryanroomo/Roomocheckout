import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  const allowed = ["https://roomonyc.com", "https://www.roomonyc.com"];
  if (allowed.some((a) => origin.startsWith(a)) || origin.includes("framer")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { email, first_name } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }

  try {
    // Insert or update — never overwrite a name with null
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = (first_name || "").trim() || null;
    const source = cleanName ? "popup" : "footer";

    // Check if subscriber already exists
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, first_name")
      .eq("email", cleanEmail)
      .maybeSingle();

    const row = {
      email: cleanEmail,
      first_name: cleanName || (existing?.first_name ?? null),
      subscribed_at: new Date().toISOString(),
      source: existing ? existing.first_name ? undefined : source : source,
    };
    // Remove undefined keys
    if (row.source === undefined) delete row.source;

    const { error: dbError } = await supabase
      .from("newsletter_subscribers")
      .upsert(row, { onConflict: "email" });

    if (dbError) throw dbError;

    // ── Klaviyo: subscribe to list via Client API ──────────────
    try {
      await fetch("https://a.klaviyo.com/client/subscriptions/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Klaviyo-Company-Id": "Wkkqmr",
          revision: "2024-10-15",
        },
        body: JSON.stringify({
          data: {
            type: "subscription",
            attributes: {
              custom_source: "Roomo Website",
              profile: {
                data: {
                  type: "profile",
                  attributes: {
                    email: email.toLowerCase().trim(),
                    first_name: (first_name || "").trim() || undefined,
                  },
                },
              },
            },
            relationships: {
              list: {
                data: {
                  type: "list",
                  id: "R7Xwtk",
                },
              },
            },
          },
        }),
      });
    } catch (klaviyoErr) {
      // Don't fail the request if Klaviyo is down — Supabase has the record
      console.error("Klaviyo subscribe error:", klaviyoErr);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("newsletter-subscribe error:", err);
    res.status(500).json({ error: err.message });
  }
}
