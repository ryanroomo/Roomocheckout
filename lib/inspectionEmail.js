// Virtual inspection email — sent manually from the admin panel after an
// early-setup (remote) delivery is complete. Links the customer to their
// virtual inspection form (photos + walkthrough videos + signature).
// Same lightweight pattern as earlyMoveInEmail.js: hosted images only,
// ~10KB HTML so Gmail never clips it.

function firstNameOf(name) {
  const n = String(name || "").trim().split(/\s+/)[0];
  return n || "there";
}

function esc(x) {
  return String(x)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function inspectionSubject(name) {
  return `${firstNameOf(name)}, your delivery is complete — review your virtual inspection`;
}

/**
 * @param {object} opts
 * @param {string} opts.name           customer full name
 * @param {string} opts.inspectionUrl  link to the customer virtual inspection form
 * @param {string[]} [opts.sets]       e.g. ["Living Room Set", "Dining Set"]
 */
export function inspectionHtml({ name, inspectionUrl, sets }) {
  const n = esc(firstNameOf(name));
  const url = esc(inspectionUrl);
  const setsLine =
    sets && sets.length
      ? `<p style="margin: 0 0 8px; font-family: 'League Spartan', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #A89595; line-height: 1.5;">
          Delivered and set up: ${esc(sets.join(" · "))}
        </p>`
      : "";
  const deadlineBlock = `<tr>
        <td class="email-deadline-pad" style="padding: 0 48px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F0EA" style="border-radius: 10px;">
            <tr>
              <td style="padding: 16px 20px; text-align: center;">
                <p style="margin: 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 14px; font-weight: 400; color: #816F68; line-height: 1.5;">
                  After your delivery is completed, you have a <span style="font-family: 'Manrope', Arial, sans-serif; font-weight: 600; color: #865651;">48-hour window</span> to review everything and report any missing items, major damage, or assembly issues.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your delivery is complete</title>
  <style>
    :root { color-scheme: light only; }
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=League+Spartan:wght@300;400;500&display=swap');

    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body { margin: 0; padding: 0; background-color: #EDE8E2; }

    @media screen and (max-width: 620px) {
      .email-wrap { width: 100% !important; }
      .email-header-pad { padding: 40px 24px 24px !important; }
      .email-body-pad { padding: 0 24px 24px !important; }
      .email-cta-pad { padding: 8px 24px 36px !important; }
      .email-deadline-pad { padding: 0 24px 28px !important; }
      .email-footer-pad { padding: 24px !important; }
      .email-divider-pad { padding: 0 24px !important; }
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EDE8E2">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Outer wrapper -->
        <table class="email-wrap" cellpadding="0" cellspacing="0" border="0" bgcolor="#F9F5F1" style="width: 100%; max-width: 600px;">

          <!-- HEADER -->
          <tr>
            <td class="email-header-pad" align="center" style="padding: 48px 32px 28px;">
              <a href="https://roomonyc.com" target="_blank" style="text-decoration: none;">
                <img src="https://checkout.roomonyc.com/email/logo.png" alt="ROOMO" width="126" style="display: block; margin: 0 auto; height: auto;" />
              </a>
            </td>
          </tr>

          <!-- MAIN BODY -->
          <tr>
            <td class="email-body-pad" style="padding: 0 48px 24px; text-align: center;">
              <p style="margin: 0 0 16px; font-family: 'League Spartan', Arial, sans-serif; font-size: 10px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: #816F68;">Virtual Inspection</p>
              <p style="margin: 0 0 16px; font-family: 'Manrope', Arial, sans-serif; font-size: 26px; font-weight: 600; line-height: 1.2; color: #49372A;">
                Your delivery is complete
              </p>
              <p style="margin: 0 0 12px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.5;">
                Hi ${n}, thank you for choosing Roomo. Our team has finished delivering and setting up your furniture.
              </p>
              <p style="margin: 0 0 12px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.5;">
                Here is your virtual inspection form — review the photo and short walkthrough video of each furniture set, then confirm your delivery with a quick signature.
              </p>
              ${setsLine}
            </td>
          </tr>

          <!-- 48H DEADLINE -->
          ${deadlineBlock}

          <!-- CTA BUTTON -->
          <tr>
            <td class="email-cta-pad" align="center" style="padding: 8px 48px 36px;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#49372A" style="border-radius: 36px; padding: 0;">
                    <a href="${url}" target="_blank"
                       style="display: inline-block; padding: 15px 32px; font-family: 'League Spartan', Arial, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase; color: #FFFFFF; text-decoration: none; border-radius: 36px; white-space: nowrap;">
                      VIEW YOUR INSPECTION
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #A89595; line-height: 1.4;">
                Questions or something doesn't look right? Just reply to this email.
              </p>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td class="email-divider-pad" style="padding: 0 58px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top: 1px solid #E5DDD6; font-size: 0; line-height: 0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="email-footer-pad" style="padding: 28px 58px 60px; text-align: center;">
              <p style="margin: 0 0 6px; font-family: 'League Spartan', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #A89595; line-height: 1;">
                You're receiving this because you have an order with Roomo.
              </p>
              <p style="margin: 0 0 6px; font-family: 'League Spartan', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #A89595; line-height: 1;">
                <a href="https://roomonyc.com/privacy" style="color: #A89595; text-decoration: underline;">Privacy Policy</a>
              </p>
              <p style="margin: 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #A89595; line-height: 1;">
                Roomo NYC &nbsp;&middot;&nbsp; Brooklyn, NY
              </p>
            </td>
          </tr>

        </table>
        <!-- End outer wrapper -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}
