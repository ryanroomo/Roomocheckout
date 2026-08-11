// Price-lock welcome email — sent automatically when someone locks
// today's pricing at the ZIP step ("moving to NYC, no ZIP yet").
// Same lightweight pattern as earlyMoveInEmail.js: hosted images only,
// small HTML so Gmail never clips it.

function esc(x) {
  return String(x)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function priceLockSubject() {
  return "Your Roomo price is locked — welcome to New York";
}

/**
 * @param {object} opts
 * @param {string} opts.lockedUntilText  e.g. "September 10, 2026"
 */
export function priceLockHtml({ lockedUntilText }) {
  const until = esc(lockedUntilText || "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your Roomo price is locked</title>
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
      .email-hero-pad { padding: 0 24px 24px !important; }
      .email-body-pad { padding: 0 24px 24px !important; }
      .email-lock-pad { padding: 0 24px 28px !important; }
      .email-cta-pad { padding: 8px 24px 36px !important; }
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

          <!-- HERO -->
          <tr>
            <td class="email-hero-pad" style="padding: 0 32px 28px;">
              <img src="https://checkout.roomonyc.com/email/welcome-illustration-2.jpg" alt="Curated Living, Delivered." width="536" style="width: 100%; height: auto; display: block; border-radius: 10px;" />
            </td>
          </tr>

          <!-- MAIN BODY -->
          <tr>
            <td class="email-body-pad" style="padding: 0 48px 24px; text-align: center;">
              <p style="margin: 0 0 16px; font-family: 'League Spartan', Arial, sans-serif; font-size: 10px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: #816F68;">Price Locked</p>
              <p style="margin: 0 0 16px; font-family: 'Manrope', Arial, sans-serif; font-size: 26px; font-weight: 600; line-height: 1.2; color: #49372A;">
                Welcome to New York
              </p>
              <p style="margin: 0 0 12px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.5;">
                Hi there, thanks for your interest in Roomo. Moving to a new city comes with a long list of things to figure out, so we took one off it for you.
              </p>
              <p style="margin: 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.5;">
                Once you know your address, pick up right where you left off. Your furniture will be waiting at today's price.
              </p>
            </td>
          </tr>

          <!-- LOCK CARD -->
          <tr>
            <td class="email-lock-pad" style="padding: 0 48px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F0EA" style="border-radius: 10px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center;">
                    <p style="margin: 0 0 4px; font-family: 'League Spartan', Arial, sans-serif; font-size: 14px; font-weight: 400; color: #816F68; line-height: 1.5;">
                      Today's pricing is locked for you until
                    </p>
                    <p style="margin: 0; font-family: 'Manrope', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #865651; line-height: 1.4;">
                      ${until}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA BUTTON -->
          <tr>
            <td class="email-cta-pad" align="center" style="padding: 8px 48px 36px;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#49372A" style="border-radius: 36px; padding: 0;">
                    <a href="https://roomonyc.com" target="_blank"
                       style="display: inline-block; padding: 15px 32px; font-family: 'League Spartan', Arial, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase; color: #FFFFFF; text-decoration: none; border-radius: 36px; white-space: nowrap;">
                      BROWSE YOUR SET
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #A89595; line-height: 1.4;">
                Questions about the move? Reach us anytime at <a href="mailto:hello@roomonyc.com" style="color: #865651; text-decoration: underline;">hello@roomonyc.com</a>.<br>We look forward to welcoming you home.
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
              <!-- Instagram icon -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 12px;">
                <tr>
                  <td align="center">
                    <a href="https://www.instagram.com/roomonyc/" target="_blank" style="text-decoration: none;">
                      <img src="https://cdn2.iconfinder.com/data/icons/social-media-2285/512/1_Instagram_colored_svg_1-128.png" alt="Instagram" width="28" height="28" style="display: block;" />
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 6px; font-family: 'League Spartan', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #A89595; line-height: 1;">
                You're receiving this because you locked your price at roomonyc.com.
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
