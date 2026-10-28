import crypto from "crypto";
import { EmailVerificationToken } from "@/lib/models";
import { sendEmail } from "@/lib/email";
import { renderVerificationEmail } from "@/lib/emailTemplates";
import { getPrimaryAppOrigin } from "@/lib/origin";
import { logInfo, logInternalError } from "@/lib/log";

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildVerifyUrl(token: string, originFallback: string): string {
  const origin = process.env.VERCEL_URL
    ? getPrimaryAppOrigin(`https://${process.env.VERCEL_URL.replace(/\/$/, "")}`)
    : getPrimaryAppOrigin(originFallback);
  return `${origin}/api/auth/verify-email?token=${token}`;
}

export async function createAndSendVerificationEmail(params: {
  userId: string | unknown;
  email: string;
  username: string;
  originFallback: string;
  isWelcome?: boolean;
}): Promise<boolean> {
  try {
    await EmailVerificationToken.updateMany(
      { user_id: params.userId, used_at: null },
      { $set: { used_at: new Date() } },
    );

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await EmailVerificationToken.create({
      user_id: params.userId,
      email: params.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const verifyUrl = buildVerifyUrl(token, params.originFallback);
    const emailData = renderVerificationEmail({
      username: params.username,
      email: params.email,
      verifyUrl,
      isWelcome: params.isWelcome,
    });

    await sendEmail({
      to: [{ email: params.email, name: params.username }],
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    logInfo("verification_email_sent", {
      userId: String(params.userId),
      email: params.email,
      isWelcome: Boolean(params.isWelcome),
    });

    return true;
  } catch (err) {
    logInternalError("verification_email_send_error", err, {
      userId: String(params.userId),
      email: params.email,
      isWelcome: Boolean(params.isWelcome),
    });
    return false;
  }
}
