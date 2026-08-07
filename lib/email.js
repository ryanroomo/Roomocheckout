import { Resend } from "resend";
import { signPortalToken } from "./authToken";
import { earlyMoveInSubject, earlyMoveInHtml } from "./earlyMoveInEmail";
import { inspectionSubject, inspectionHtml } from "./inspectionEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "Roomo <noreply@roomonyc.com>";

// Hero image for confirmation emails
const HERO_IMAGE = "https://checkout.roomonyc.com/email-images/email-table.jpg";

// ── Early move-in email (day-after-order, or a manual admin send) ──
// Reply-To is hello@ so the customer's reply (choosing Option 1 or 2) lands in
// the team inbox, not the noreply address.
export async function sendEarlyMoveInEmail({ email, name }) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    reply_to: "hello@roomonyc.com",
    subject: earlyMoveInSubject(name),
    html: earlyMoveInHtml(name),
  });
  if (error) {
    console.error("Resend early move-in email error:", error);
    throw new Error(error.message || "Failed to send early move-in email");
  }
  return data;
}

// ── Virtual inspection email (after early-setup delivery) ───────
// Sent manually from the admin panel once the workers have uploaded
// their inspection photos/videos. Reply-To is hello@ so "something
// looks wrong" replies land in the team inbox.
export async function sendInspectionEmail({ email, name, inspectionUrl, sets }) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    reply_to: "hello@roomonyc.com",
    subject: inspectionSubject(name),
    html: inspectionHtml({ name, inspectionUrl, sets }),
  });
  if (error) {
    console.error("Resend inspection email error:", error);
    throw new Error(error.message || "Failed to send inspection email");
  }
  return data;
}

// ── Order confirmation email (after $25 deposit) ────────────────
export async function sendOrderConfirmation({ email, name, order, items }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;
  const deliverySlot = order.delivery_slot || "";

  // Build items summary (compact, no bullets)
  const itemsSummary = items
    .map((i) => {
      const key = String(i.set_type || i.set || "").toLowerCase();
      const setName =
        key === "bedding"
          ? "Bedroom"
          : key === "living"
            ? "Living"
            : key === "dining"
              ? "Dining"
              : key
                ? key.charAt(0).toUpperCase() + key.slice(1)
                : "Set";
      const mode = i.mode === "rent" ? `${i.months}-mo rental` : "Purchase";
      const price =
        i.mode === "rent" && i.price_cents
          ? ` · $${(i.price_cents / 100).toFixed(0)}/mo`
          : "";
      return `${setName} Set · ${mode}${price}`;
    })
    .join("<br>");

  // Portal link — signed, expiring token (unforgeable). Falls back to plain
  // base64 only if AUTH_TOKEN_SECRET isn't set yet, so email never fails.
  let portalToken;
  try {
    portalToken = signPortalToken(email);
  } catch {
    portalToken = Buffer.from(email).toString("base64");
  }
  const portalLink = `https://checkout.roomonyc.com/account.html?token=${encodeURIComponent(
    portalToken
  )}`;

  const heroImg = HERO_IMAGE;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    html, body, table, td, div, p, h1, a { color-scheme: light only; }
  </style>
  <!--[if mso]><style>table,td{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F9F5F1;font-family:'Trebuchet MS',Trebuchet,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F1;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Main Card (logo + image + content all in one white container) -->
        <tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">

          <!-- Logo -->
          <tr><td style="padding:32px 0 24px;text-align:center;">
            <img src="https://checkout.roomonyc.com/email-images/roomo-museo.png" alt="ROOMO" width="130" style="display:inline-block;width:130px;height:auto;" />
          </td></tr>

          <!-- Hero Image (rounded, inset) -->
          <tr><td style="padding:0 24px 32px;text-align:center;">
            <img src="${heroImg}" alt="Roomo furniture" width="472" style="display:block;width:100%;height:auto;border-radius:12px;" />
          </td></tr>

          <!-- Content -->
          <tr><td style="padding:0 40px 32px;">

          <!-- Headline -->
          <h1 style="margin:0 0 12px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:26px;font-weight:bold;color:#49372A;text-align:center;line-height:1.3;">
            Your home is on its way.
          </h1>
          <p style="margin:0 0 32px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:15px;color:#816E68;text-align:center;line-height:1.7;">
            Hey ${firstName} — we've received your deposit and your order is confirmed. We're preparing your furniture for delivery.
          </p>

          ${
            deliveryDate || itemsSummary
              ? `
          <!-- Order Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0EA;border-radius:10px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-family:'Trebuchet MS',Trebuchet,sans-serif;">
                ${
                  deliveryDate
                    ? `
                <tr>
                  <td style="font-size:11px;color:#816E68;text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px;" valign="top">Delivery</td>
                  <td style="font-size:11px;color:#816E68;text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px;text-align:right;" valign="top">Items</td>
                </tr>
                <tr>
                  <td style="font-size:15px;font-weight:bold;color:#49372A;padding:0;" valign="top">${deliveryDate}</td>
                  <td style="font-size:14px;color:#49372A;padding:0;text-align:right;line-height:1.6;" valign="top">${itemsSummary}</td>
                </tr>
                ${
                  deliverySlot
                    ? `
                <tr>
                  <td style="font-size:13px;color:#816E68;padding:4px 0 0;">${deliverySlot}</td>
                  <td></td>
                </tr>`
                    : ""
                }
                `
                    : `
                <tr>
                  <td style="font-size:11px;color:#816E68;text-transform:uppercase;letter-spacing:0.5px;padding:0 0 6px;">Your items</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#49372A;padding:0;line-height:1.6;">${itemsSummary}</td>
                </tr>
                `
                }
              </table>
            </td></tr>
          </table>
          `
              : ""
          }

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${portalLink}" style="display:inline-block;background:#49372A;color:#F9F5F1;text-decoration:none;padding:14px 48px;border-radius:8px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.3px;">
                View / manage your order
              </a>
            </td></tr>
          </table>

          <p style="margin:-16px 0 28px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:12px;color:#816E68;line-height:1.5;text-align:center;">
            Bookmark this link — you can use it anytime to view and manage your order.
          </p>

          <!-- Cancellation note -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #DED4D1;">
            <tr><td style="padding-top:20px;">
              <p style="margin:0;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:#816E68;line-height:1.6;text-align:center;">
                Free cancellation up to 48 hours before delivery.<br>After that, your card will be charged.
              </p>
            </td></tr>
          </table>
        </td></tr>

          </table>
        </td></tr>

        <!-- Spacer -->
        <tr><td style="height:24px;"></td></tr>

        <!-- Footer -->
        <tr><td style="background:#49372A;border-radius:12px;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 12px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:rgba(249,245,241,0.5);line-height:1.6;">
            Questions about your order?
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="border:1px solid rgba(249,245,241,0.3);border-radius:8px;">
              <a href="mailto:support@roomonyc.com" style="display:inline-block;padding:10px 28px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:#F9F5F1;text-decoration:none;font-weight:500;">
                Contact support
              </a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(249,245,241,0.1);">
            <tr><td style="padding-top:20px;text-align:center;">
              <img src="https://checkout.roomonyc.com/email-images/roomo-logo-white.png" alt="Roomo" width="80" height="13" style="display:inline-block;width:80px;height:auto;opacity:0.7;margin-bottom:4px;" />
              <p style="margin:0;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:11px;color:rgba(249,245,241,0.35);line-height:1.8;">
                &copy; 2026 Roomo LLC &middot; New York, NY<br>
                <a href="https://roomonyc.com/privacy" style="color:rgba(249,245,241,0.45);text-decoration:underline;">Privacy</a> &nbsp;&middot;&nbsp;
                <a href="https://www.roomonyc.com/rental-contract" style="color:rgba(249,245,241,0.45);text-decoration:underline;">Terms</a> &nbsp;&middot;&nbsp;
                <a href="https://roomonyc.com" style="color:rgba(249,245,241,0.45);text-decoration:underline;">roomonyc.com</a>
              </p>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Your Roomo order is confirmed, ${firstName}!`,
    html,
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  console.log(`Order confirmation sent to ${email}, id: ${data?.id}`);
  return data;
}

// ── Cancellation confirmation email ────────────────────────────
export async function sendCancellationEmail({ email, name, order, refunded }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  const items = (order.order_items || [])
    .map((i) => {
      const setName = (i.set_type || "Set").replace(/^\w/, (c) => c.toUpperCase());
      return `${setName} Set`;
    })
    .join(", ");

  const refundNote = refunded
    ? "Your $25 deposit has been refunded to your original payment method. Please allow 5–10 business days for the refund to appear on your statement."
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    html, body, table, td, div, p, h1, a { color-scheme: light only; }
  </style>
</head>
<body style="margin:0;padding:0;background:#F9F5F1;font-family:'Trebuchet MS',Trebuchet,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F1;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Main Card -->
        <tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">

          <!-- Logo -->
          <tr><td style="padding:32px 0 24px;text-align:center;">
            <img src="https://checkout.roomonyc.com/email-images/roomo-museo.png" alt="ROOMO" width="130" style="display:inline-block;width:130px;height:auto;" />
          </td></tr>

          <!-- Content -->
          <tr><td style="padding:0 40px 32px;">

          <h1 style="margin:0 0 12px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:24px;font-weight:bold;color:#49372A;text-align:center;line-height:1.3;">
            Your order has been cancelled.
          </h1>
          <p style="margin:0 0 24px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:15px;color:#816E68;text-align:center;line-height:1.7;">
            Hey ${firstName} — we've cancelled your order as requested.${deliveryDate ? ` Your delivery was scheduled for ${deliveryDate}.` : ""}
          </p>

          ${refundNote ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0EA;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:14px;color:#49372A;line-height:1.6;">
                <strong>Refund details</strong><br>
                ${refundNote}
              </p>
            </td></tr>
          </table>
          ` : ""}

          ${items ? `
          <p style="margin:0 0 24px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:#816E68;text-align:center;line-height:1.6;">
            Cancelled items: ${items}
          </p>
          ` : ""}

          <p style="margin:0;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:14px;color:#816E68;text-align:center;line-height:1.7;">
            Changed your mind? You can always place a new order at<br>
            <a href="https://roomonyc.com" style="color:#49372A;font-weight:600;text-decoration:underline;">roomonyc.com</a>
          </p>

          </td></tr>

          </table>
        </td></tr>

        <!-- Spacer -->
        <tr><td style="height:24px;"></td></tr>

        <!-- Footer -->
        <tr><td style="background:#49372A;border-radius:12px;padding:32px 40px;text-align:center;">
          <p style="margin:0 0 12px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:rgba(249,245,241,0.5);line-height:1.6;">
            Questions about your cancellation?
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="border:1px solid rgba(249,245,241,0.3);border-radius:8px;">
              <a href="mailto:support@roomonyc.com" style="display:inline-block;padding:10px 28px;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:13px;color:#F9F5F1;text-decoration:none;font-weight:500;">
                Contact support
              </a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(249,245,241,0.1);">
            <tr><td style="padding-top:20px;text-align:center;">
              <img src="https://checkout.roomonyc.com/email-images/roomo-logo-white.png" alt="Roomo" width="80" height="13" style="display:inline-block;width:80px;height:auto;opacity:0.7;margin-bottom:4px;" />
              <p style="margin:0;font-family:'Trebuchet MS',Trebuchet,sans-serif;font-size:11px;color:rgba(249,245,241,0.35);line-height:1.8;">
                &copy; 2026 Roomo LLC &middot; New York, NY<br>
                <a href="https://roomonyc.com/privacy" style="color:rgba(249,245,241,0.45);text-decoration:underline;">Privacy</a> &nbsp;&middot;&nbsp;
                <a href="https://www.roomonyc.com/rental-contract" style="color:rgba(249,245,241,0.45);text-decoration:underline;">Terms</a> &nbsp;&middot;&nbsp;
                <a href="https://roomonyc.com" style="color:rgba(249,245,241,0.45);text-decoration:underline;">roomonyc.com</a>
              </p>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Your Roomo order has been cancelled`,
    html,
  });

  if (error) {
    console.error("Resend cancellation email error:", error);
    throw new Error(`Cancellation email failed: ${error.message}`);
  }

  console.log(`Cancellation email sent to ${email}, id: ${data?.id}`);
  return data;
}

// ─── Internal: notify the team of a customer refund request ──────
export async function sendRefundRequestNotification({ order, customer, reason }) {
  const team = process.env.TEAM_EMAIL || "hello@roomonyc.com";
  const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
  const adminLink = "https://checkout.roomonyc.com/admin.html";

  const rows = [
    ["Customer", `${customer?.name || "—"} (${customer?.email || "—"})`],
    ["Order ID", order?.id || "—"],
    ["Status", order?.status || "—"],
    ["Monthly rent", money(order?.rental_monthly_cents)],
    ["Deposit paid", money(order?.deposit_cents)],
    ["Delivery date", order?.delivery_date || "—"],
    ["Reason", reason || "—"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#8B7355;font-size:13px">${k}</td><td style="padding:4px 0;color:#49372A;font-size:13px;font-weight:600">${v}</td></tr>`
    )
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="color:#49372A;font-size:18px">Refund request — action needed</h2>
    <p style="color:#8B7355;font-size:14px">A customer requested a refund. Review and process it in the admin panel (Cancel or Refund $25).</p>
    <table style="border-collapse:collapse;margin:12px 0">${rows}</table>
    <p><a href="${adminLink}" style="display:inline-block;background:#49372A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">Open Admin</a></p>
  </div>`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: team,
    subject: `Refund requested — ${customer?.email || "customer"} (order ${String(order?.id || "").slice(0, 8)})`,
    html,
  });

  if (error) {
    console.error("Resend refund-request email error:", error);
    throw new Error(`Refund-request email failed: ${error.message}`);
  }
  console.log(`Refund-request notification sent to ${team}, id: ${data?.id}`);
  return data;
}
