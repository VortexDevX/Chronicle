import { getRequiredEnv, getOptionalEnv } from "@/lib/config";

type BrevoRecipient = {
  email: string;
  name?: string;
};

type BrevoEmail = {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent: string;
};

export async function sendBrevoEmail(payload: BrevoEmail): Promise<void> {
  const apiKey = getRequiredEnv("BREVO_API_KEY");
  const fromEmail = getRequiredEnv("BREVO_FROM_EMAIL");
  const fromName = getOptionalEnv("BREVO_FROM_NAME", "Chronicle");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: payload.to,
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`Brevo email failed: ${res.status} ${message}`);
  }
}
