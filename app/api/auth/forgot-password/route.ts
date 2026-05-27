import crypto from "crypto";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { PasswordResetToken, User } from "@/lib/models";
import { sendBrevoEmail } from "@/lib/email";
import { jsonOk } from "@/lib/http";
import { getClientIp } from "@/lib/rateLimit";
import { enforceRateLimit } from "@/lib/guards";
import { logInternalError } from "@/lib/log";
import { getPrimaryAppOrigin } from "@/lib/origin";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const GENERIC_RESPONSE = {
  message: "If an account exists for that email, a reset link has been sent.",
};

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getResetOrigin(req: NextRequest): string {
  if (process.env.VERCEL_URL) {
    return getPrimaryAppOrigin(`https://${process.env.VERCEL_URL.replace(/\/$/, "")}`);
  }

  return getPrimaryAppOrigin(req.nextUrl.origin);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const guard = await enforceRateLimit(req, {
    key: `auth:forgot_password:${ip}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
    strict: true,
    route: "auth/forgot-password",
    method: "POST",
    operation: "forgot_password",
    message: "Too many reset requests. Please retry shortly.",
  });
  if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);

    if (!isValidEmail(email)) {
      return jsonOk(GENERIC_RESPONSE);
    }

    await connectDB();
    const user = await User.findOne({ email }).select("_id username email");

    if (!user) {
      return jsonOk(GENERIC_RESPONSE);
    }

    const accountGuard = await enforceRateLimit(req, {
      key: `auth:forgot_password:account:${user._id}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
      strict: true,
      route: "auth/forgot-password",
      method: "POST",
      operation: "forgot_password_account",
      message: "Too many reset requests. Please retry shortly.",
    });
    if (!accountGuard.allowed) {
      return jsonOk(GENERIC_RESPONSE);
    }

    await PasswordResetToken.updateMany(
      { user_id: user._id, used_at: null },
      { $set: { used_at: new Date() } },
    );

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await PasswordResetToken.create({
      user_id: user._id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const resetUrl = `${getResetOrigin(req)}/reset-password?token=${token}`;
    await sendBrevoEmail({
      to: [{ email, name: user.username }],
      subject: "Reset your Chronicle password",
      htmlContent: [
        "<p>You asked to reset your Chronicle password.</p>",
        `<p><a href="${resetUrl}">Reset password</a></p>`,
        "<p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>",
      ].join(""),
      textContent: [
        "You asked to reset your Chronicle password.",
        `Reset password: ${resetUrl}`,
        "This link expires in 30 minutes. If you did not request it, ignore this email.",
      ].join("\n\n"),
    });

    return jsonOk(GENERIC_RESPONSE);
  } catch (err) {
    logInternalError("forgot_password_error", err, {
      route: "auth/forgot-password",
    });
    return jsonOk(GENERIC_RESPONSE);
  }
}
