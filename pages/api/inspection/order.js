import { supabase } from "../../../lib/supabase";
import { verifyInspectionToken } from "../../../lib/authToken";

/**
 * GET /api/inspection/order?token=<signed inspection token>
 *
 * Public, token-authed. Powers both inspection pages:
 *   role "worker"   → worker-inspection.html (what to shoot, what's done)
 *   role "customer" → virtual-inspection.html (review media + sign)
 *
 * Returns order info, the furniture sets on the order, and — when the
 * worker has submitted — signed download URLs for each set's media.
 */

const SET_META = {
  living:  { id: "living",  name: "Living Room Set", items: ["Sofa", "Rug", "Coffee Table", "Floor Lamp"] },
  dining:  { id: "dining",  name: "Dining Set",      items: ["Dining Table", "Dining Chairs"] },
  bedding: { id: "bedding", name: "Bedroom Set",     items: ["Bed Frame", "Mattress", "Nightstand"] },
};

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDeadline(baseIso) {
  const d = new Date(new Date(baseIso).getTime() + 48 * 60 * 60 * 1000);
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("inspections").createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    console.error("signedUrl error:", path, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = verifyInspectionToken(req.query.token);
  if (!auth) return res.status(401).json({ error: "This link is invalid or has expired." });

  try {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, customers!inner(*), order_items(*)")
      .eq("id", auth.orderId)
      .single();
    if (error || !order) return res.status(404).json({ error: "Order not found" });

    const { data: inspection } = await supabase
      .from("inspections")
      .select("*")
      .eq("order_id", auth.orderId)
      .maybeSingle();

    const sets = (order.order_items || [])
      .map((i) => SET_META[String(i.set_type || "").toLowerCase()])
      .filter(Boolean);

    const address = [
      order.delivery_address,
      order.delivery_unit,
      order.delivery_city,
      order.delivery_state,
      order.delivery_zip,
    ]
      .filter(Boolean)
      .join(", ");

    // Signed URLs for whatever media exists
    const media = {};
    const rawMedia = inspection?.media || {};
    for (const [setId, m] of Object.entries(rawMedia)) {
      media[setId] = {
        photo: m.photo || null,
        video: m.video || null,
        photoUrl: await signedUrl(m.photo),
        videoUrl: await signedUrl(m.video),
      };
    }

    // 48h report window is FIXED at the moment the worker submitted the
    // inspection — never computed from when the customer opens the link.
    const deadlineBase = inspection?.submitted_at || null;
    const inspectionDeadline = deadlineBase ? fmtDeadline(deadlineBase) : null;

    return res.status(200).json({
      role: auth.role,
      orderId: order.id,
      orderShort: String(order.id).split("-")[0],
      customerName: ["customer", "onsite"].includes(auth.role) ? order.customers?.name || "" : undefined,
      deliveryAddress: address,
      deliveryDate: fmtDate(order.delivery_date),
      deliverySlot: order.delivery_slot || "",
      sets,
      inspection: {
        status: inspection?.status || "pending",
        submittedAt: inspection?.submitted_at || null,
        media,
      },
      inspectionDeadline,
    });
  } catch (err) {
    console.error("inspection order error:", err);
    return res.status(500).json({ error: err.message });
  }
}
