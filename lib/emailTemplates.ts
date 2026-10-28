import { getPrimaryAppOrigin } from "./origin";

export type VerificationEmailOptions = {
  username: string;
  email: string;
  verifyUrl: string;
  isWelcome?: boolean;
  appOrigin?: string;
};

export function escapeHtml(text: string): string {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getBrandLogoUrl(appOrigin?: string): string {
  if (appOrigin && appOrigin.startsWith("https://")) {
    return `${appOrigin.replace(/\/$/, "")}/icon.png`;
  }
  return "https://chroniclex.vercel.app/icon.png";
}

export function renderVerificationEmail(options: VerificationEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const { username, verifyUrl, isWelcome = false, appOrigin } = options;
  const safeUsername = escapeHtml(username);
  const primaryOrigin = appOrigin || getPrimaryAppOrigin("https://chroniclex.vercel.app");
  const logoUrl = getBrandLogoUrl(primaryOrigin);
  const siteUrl = primaryOrigin.startsWith("http") ? primaryOrigin : "https://chroniclex.vercel.app";
  const currentYear = new Date().getFullYear();

  const subject = isWelcome
    ? `Welcome to Chronicle — Verify your email, ${username}!`
    : "Verify your email address for Chronicle";

  const kickerText = isWelcome ? "Account Verification" : "Email Verification";
  const headline = isWelcome
    ? `Welcome aboard, <span style="color: #f43f5e;">${safeUsername}</span>`
    : `Verify your email, <span style="color: #f43f5e;">${safeUsername}</span>`;

  const introText = isWelcome
    ? "Thank you for creating an account on Chronicle! Confirm your email address to verify your account, secure your private library, and receive automated tracker updates."
    : "You requested a verification link for your Chronicle account. Confirm your email address below to activate your account and keep tracking seamlessly.";

  const buttonText = isWelcome ? "Verify Email & Get Started" : "Verify Email Address";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #0b0c0f; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 12px !important; }
      .email-card { padding: 28px 20px !important; border-radius: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Hidden preheader text -->
  <div style="display: none; font-size: 1px; color: #0b0c0f; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${isWelcome ? "Welcome to Chronicle! Confirm your email to activate your account." : "Confirm your email address to verify your Chronicle account."}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0c0f; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 44px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px;" class="email-container">
          
          <!-- Main Card Container (Matches website .auth-container) -->
          <tr>
            <td style="background-color: #12141a; border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 20px; padding: 40px 36px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);" class="email-card">
              
              <!-- Brand Header (Real Chronicle X logo + Typography) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${siteUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="${logoUrl}" width="52" height="52" alt="Chronicle X" style="border-radius: 13px; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 8px 24px rgba(244, 63, 94, 0.25); display: block; margin: 0 auto;" />
                    </a>
                    <div style="margin-top: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 19px; font-weight: 800; letter-spacing: 0.14em; color: #f8fafc; text-transform: uppercase;">
                      CHRONICLE <span style="color: #f43f5e;">X</span>
                    </div>
                    <div style="margin-top: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.09em; color: #747b88; text-transform: uppercase;">
                      Universal Media Tracker
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height: 1px; background-color: rgba(255, 255, 255, 0.08); margin: 0 0 26px 0;"></div>

              <!-- Pill Kicker -->
              <div style="margin-bottom: 12px;">
                <span style="display: inline-block; padding: 4px 10px; background-color: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.28); border-radius: 9999px; color: #f43f5e; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  ${kickerText}
                </span>
              </div>

              <!-- Main Heading -->
              <h1 style="margin: 0 0 14px 0; font-size: 23px; font-weight: 750; color: #ffffff; letter-spacing: -0.02em; line-height: 1.35; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${headline}
              </h1>

              <!-- Intro Copy -->
              <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.6; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${introText}
              </p>

              <!-- Primary CTA Button (Website Soft Red Accent #f43f5e) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" target="_blank" style="display: inline-block; background-color: #f43f5e; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; font-weight: 750; text-decoration: none; padding: 14px 34px; border-radius: 10px; box-shadow: 0 4px 18px rgba(244, 63, 94, 0.35); text-align: center; letter-spacing: 0.01em;">
                      ${buttonText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiration Notice (Theme Card #161821) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0 24px 0;">
                <tr>
                  <td style="background-color: #161821; border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 10px; padding: 14px 16px;">
                    <div style="font-size: 12.5px; line-height: 1.55; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      <span style="color: #f43f5e; font-weight: 700;">&#9679; Link expires in 24 hours.</span> If you did not create an account on Chronicle, you can safely ignore this email.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Raw Fallback Link Box -->
              <div style="margin-top: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 11.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  Trouble clicking? Paste this link into your browser:
                </p>
                <div style="background-color: #0b0c0f; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 11px 13px; word-break: break-all; font-family: 'Cascadia Mono', Consolas, Monaco, monospace; font-size: 11.5px; line-height: 1.5; color: #f43f5e;">
                  <a href="${verifyUrl}" target="_blank" style="color: #f43f5e; text-decoration: none;">${escapeHtml(verifyUrl)}</a>
                </div>
              </div>

              <!-- Media Badges Row (Anime, Manhwa, Donghua, Light Novels) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.07); padding-top: 20px;">
                <tr>
                  <td align="center">
                    <span style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      Anime &bull; Manhwa &bull; Donghua &bull; Light Novels
                    </span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td align="center" style="padding-top: 28px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <a href="${siteUrl}" target="_blank" style="color: #94a3b8; text-decoration: none; font-weight: 600;">Chronicle X</a> &bull; Universal Media Tracker
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                &copy; ${currentYear} Chronicle. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = isWelcome
    ? `Welcome to Chronicle, ${username}!\n\nConfirm your email address to verify your account and activate automated updates for Anime, Manhwa, Donghua, and Light Novels.\n\nVerify your email here:\n${verifyUrl}\n\nThis link expires in 24 hours.\nIf you did not register, please ignore this email.\n\n© ${currentYear} Chronicle X`
    : `Verify your Chronicle email, ${username}!\n\nClick the link below to verify your email address:\n${verifyUrl}\n\nThis link expires in 24 hours.\nIf you did not request this, please ignore this email.\n\n© ${currentYear} Chronicle X`;

  return { subject, html, text };
}
