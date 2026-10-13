import { getRequiredEnv, getOptionalEnv } from "@/lib/config";

export type EmailRecipient = {
  email: string;
  name?: string;
};

export type EmailPayload = {
  to: EmailRecipient[] | string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  html?: string;
  text?: string;
};

/**
 * Send transactional email using the Resend API.
 * Supports RESEND_API_KEY, SENDER_EMAIL, SENDER_NAME.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = getOptionalEnv("RESEND_API_KEY") || getRequiredEnv("RESEND_API_KEY");
  const senderEmail = getOptionalEnv("SENDER_EMAIL") || getRequiredEnv("SENDER_EMAIL");
  const senderName = getOptionalEnv("SENDER_NAME", getOptionalEnv("BREVO_FROM_NAME", "Chronicle"));

  const from = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
  const toList = payload.to.map((item) => (typeof item === "string" ? item : item.email));
  const html = payload.html || payload.htmlContent || "";
  const text = payload.text || payload.textContent || "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: toList,
      subject: payload.subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`Resend email failed: ${res.status} ${message}`);
  }
}

// Backward-compatible alias for existing callers
export const sendBrevoEmail = sendEmail;
