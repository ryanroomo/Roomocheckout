// Early move-in email — the "have your home ready before you arrive" message.
// Sent the day after an order (future flow) or manually from the admin panel.
// Images are hosted at checkout.roomonyc.com/email/* so the email stays light
// (~10KB) and never gets clipped by Gmail.

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

export function earlyMoveInSubject(name) {
  return `Hey ${firstNameOf(name)}, quick thing before your delivery`;
}

export function earlyMoveInHtml(name) {
  const n = esc(firstNameOf(name));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Hey ${n}, quick thing before your delivery</title>
  <style>
    :root { color-scheme: light only; }
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=League+Spartan:wght@300;400;500&display=swap');

    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body { margin: 0; padding: 0; background-color: #EDE8E2; }
    .opt-img-mobile { display: none; }

    @media screen and (max-width: 620px) {
      .email-wrap { width: 100% !important; }
      .email-header-pad { padding: 40px 24px 24px !important; }
      .email-hero-pad { padding: 0 32px 24px !important; }
      .email-body-pad { padding: 0 24px 24px !important; }
      .email-options-pad { padding: 24px 24px !important; }
      .email-option1-pad { padding: 0 24px 24px !important; }
      .email-steps-pad { padding: 24px !important; }
      .email-footer-pad { padding: 24px !important; }
      .email-divider-pad { padding: 0 24px !important; }
      .hero-img { height: auto !important; }
      .hero-col { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      .hero-desktop { display: none !important; }
      .opt-img-mobile { display: block !important; }
      .steps-desktop { display: none !important; }
      .steps-mobile { display: block !important; }
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
            <td class="email-body-pad" style="padding: 0 32px 28px; text-align: center;">
              <p style="margin: 0 0 14px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.5;">
                Hi ${n}, quick note before your delivery. If you want your home ready before you even arrive, you can. There are two ways it can work.
              </p>
              <p style="margin: 0; font-family: 'Manrope', Arial, sans-serif; font-size: 26px; font-weight: 600; line-height: 1.2; letter-spacing: 0; color: #49372A;">
                Two ways to move in
              </p>
            </td>
          </tr>

          <!-- HERO IMAGES (Option 1 / Option 2) -->
          <tr>
            <td style="padding: 0 24px 32px;">
              <div class="hero-desktop">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="hero-col" width="50%" valign="top" style="padding: 0 6px;">
                    <img src="https://checkout.roomonyc.com/email/option1.jpg" alt="Option 1: we set up before you arrive" width="252" style="width: 100%; height: auto; display: block; border-radius: 10px;" />
                  </td>
                  <td class="hero-col" width="50%" valign="top" style="padding: 0 6px;">
                    <img src="https://checkout.roomonyc.com/email/option2.jpg" alt="Option 2: on-site delivery on move-in day" width="252" style="width: 100%; height: auto; display: block; border-radius: 10px;" />
                  </td>
                </tr>
              </table>
              </div>
            </td>
          </tr>

          <!-- OPTION 1 -->
          <tr>
            <td class="email-option1-pad" style="padding: 0 48px 24px; text-align: center;">
              <div class="opt-img-mobile"><img src="https://checkout.roomonyc.com/email/option1.jpg" alt="Option 1: we set up before you arrive" style="width: 100%; height: auto; display: block; border-radius: 10px; margin: 0 0 16px;" /></div>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#816F68" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto 14px;">
                <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"></path>
                <circle cx="16.5" cy="7.5" r=".5" fill="#816F68"></circle>
              </svg>
              <p style="margin: 0 0 16px; font-family: 'League Spartan', Arial, sans-serif; font-size: 10px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: #816F68;">Option 1</p>
              <p style="margin: 0 0 16px; font-family: 'Manrope', Arial, sans-serif; font-size: 19px; font-weight: 600; color: #49372A; line-height: 1.2;">
                We set up before you arrive
              </p>
              <p style="margin: 0 0 8px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.2;">
                Once your lease starts, the apartment is yours, even if you haven't picked up the keys yet. Just let your building or landlord know that Roomo is authorized to access the unit on your behalf, and we'll have everything installed and ready before you walk in.
              </p>
              <p style="margin: 0 0 8px; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.2;">
                You arrive that evening or the next day to a fully furnished home. No waiting around, no need to be there for installation.
              </p>
              <p style="margin: 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 13px; font-weight: 400; font-style: italic; color: #A89595; line-height: 1.2;">
                One thing to note: setup can only happen on or after your lease start date. A quick message to your building a few days ahead is usually all it takes.
              </p>
            </td>
          </tr>

          <!-- OPTION 2 -->
          <tr>
            <td class="email-options-pad" style="padding: 24px 48px; text-align: center;">
              <div class="opt-img-mobile"><img src="https://checkout.roomonyc.com/email/option2.jpg" alt="Option 2: on-site delivery on move-in day" style="width: 100%; height: auto; display: block; border-radius: 10px; margin: 0 0 16px;" /></div>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#816F68" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto 14px;">
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
                <path d="M15 18H9"></path>
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path>
                <circle cx="17" cy="18" r="2"></circle>
                <circle cx="7" cy="18" r="2"></circle>
              </svg>
              <p style="margin: 0 0 16px; font-family: 'League Spartan', Arial, sans-serif; font-size: 10px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: #816F68;">Option 2</p>
              <p style="margin: 0 0 16px; font-family: 'Manrope', Arial, sans-serif; font-size: 19px; font-weight: 600; color: #49372A; line-height: 1.2;">
                On-site delivery on move-in day
              </p>
              <p style="margin: 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #816F68; line-height: 1.2;">
                We'll come by on your move-in day and take care of delivery and assembly while you're there to let us in.
              </p>
            </td>
          </tr>

          <!-- CTA BUTTON -->
          <tr>
            <td align="center" style="padding: 8px 48px 36px;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#49372A" style="border-radius: 36px; padding: 0;">
                    <a href="mailto:hello@roomonyc.com" target="_blank"
                       style="display: inline-block; padding: 14px 24px; font-family: 'League Spartan', Arial, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0; text-transform: uppercase; color: #FFFFFF; text-decoration: none; border-radius: 36px; white-space: nowrap;">
                      REPLY TO THIS EMAIL
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-family: 'League Spartan', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #A89595; line-height: 1.4;">
                No pressure. If we don't hear back, we'll go with Option 2 and deliver on your move-in day.
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
