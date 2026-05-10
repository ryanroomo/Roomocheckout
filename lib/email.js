import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "Roomo <noreply@roomonyc.com>";

// ── Order confirmation email (after $25 deposit) ────────────────
export async function sendOrderConfirmation({ email, name, order, items }) {
  const firstName = (name || "").split(" ")[0] || "there";
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  // Build item list HTML
  const itemsHtml = items
    .map((i) => {
      const setName = (i.set_type || i.set || "Set").replace(/^\w/, (c) => c.toUpperCase());
      const mode = i.mode === "rent" ? `${i.months}-mo rental` : "Purchase";
      return `<li style="margin-bottom:4px;">${setName} Set — ${mode}</li>`;
    })
    .join("");

  // Portal link (placeholder until designer's page is ready)
  const portalToken = Buffer.from(email).toString("base64");
  const portalLink = `https://roomonyc.com/order-status?token=${portalToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:#1a1a1a;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;letter-spacing:1px;">ROOMO</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">
            Hey ${firstName}!
          </h2>
          <p style="margin:0 0 24px;color:#555;font-size:16px;line-height:1.6;">
            Your home is being prepared. We've received your $25 deposit and your order is confirmed.
          </p>

          ${deliveryDate ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Delivery Date</p>
              <p style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;">${deliveryDate}${order.delivery_slot ? ` · ${order.delivery_slot}` : ""}</p>
            </td></tr>
          </table>
          ` : ""}

          ${itemsHtml ? `
          <p style="margin:0 0 8px;color:#1a1a1a;font-size:14px;font-weight:600;">Your items:</p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#555;font-size:14px;line-height:1.8;">
            ${itemsHtml}
          </ul>
          ` : ""}

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${portalLink}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                View Your Order
              </a>
            </td></tr>
          </table>

          <!-- Cancellation policy -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;margin-top:8px;">
            <tr><td style="padding-top:20px;">
              <p style="margin:0;color:#888;font-size:13px;line-height:1.6;">
                You can cancel for free up until 48 hours before your scheduled delivery.
                After that, your card will be charged and cancellations are no longer available.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fafafa;padding:24px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#aaa;font-size:12px;text-align:center;line-height:1.6;">
            Roomo — Furniture for your NYC apartment<br>
            <a href="https://roomonyc.com" style="color:#888;text-decoration:underline;">roomonyc.com</a>
          </p>
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
