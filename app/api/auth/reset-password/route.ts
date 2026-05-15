import crypto from "crypto";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { PasswordResetToken, User } from "@/lib/models";
import { jsonOk, jsonError } from "@/lib/http";
import { getClientIp } from "@/lib/rateLimit";
import { enforceRateLimit } from "@/lib/guards";
import { logInternalError } from "@/lib/log";

const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const BCRYPT_ROUNDS = 12;

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters`;
  }
  if (password.length > MAX_PASSWORD) {
    return `Password must be at most ${MAX_PASSWORD} characters`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const guard = await enforceRateLimit(req, {
    key: `auth:reset_password:${ip}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
    strict: true,
    route: "auth/reset-password",
    method: "POST",
    operation: "reset_password",
    message: "Too many reset attempts. Please retry shortly.",
  });
  if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "");
    const password = String(body.password || "");
    const passwordError = validatePassword(password);

    if (!token || passwordError) {
      return jsonError(
        passwordError ? "WEAK_PASSWORD" : "INVALID_TOKEN",
        passwordError || "Reset link is invalid or expired",
        400,
      );
    }

    await connectDB();
    const tokenHash = hashResetToken(token);
    const reset = await PasswordResetToken.findOne({
      token_hash: tokenHash,
      used_at: null,
      expires_at: { $gt: new Date() },
    });

    if (!reset) {
      return jsonError("INVALID_TOKEN", "Reset link is invalid or expired", 400);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.findByIdAndUpdate(
      reset.user_id,
      {
        password_hash: passwordHash,
        $inc: { auth_version: 1 },
      },
      { new: true },
    ).select("_id");

    if (!user) {
      return jsonError("INVALID_TOKEN", "Reset link is invalid or expired", 400);
    }

    reset.used_at = new Date();
    await reset.save();

    return jsonOk({ success: true });
  } catch (err) {
    logInternalError("reset_password_error", err, {
      route: "auth/reset-password",
    });
    return jsonError("RESET_INTERNAL_ERROR", "Could not reset password", 500);
  }
}
