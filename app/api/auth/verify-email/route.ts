import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EmailVerificationToken, User } from "@/lib/models";
import { sendBrevoEmail } from "@/lib/email";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { getPrimaryAppOrigin } from "@/lib/origin";
import { logInternalError } from "@/lib/log";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getVerifyOrigin(req: NextRequest): string {
  if (process.env.VERCEL_URL) {
    return getPrimaryAppOrigin(`https://${process.env.VERCEL_URL.replace(/\/$/, "")}`);
  }

  return getPrimaryAppOrigin(req.nextUrl.origin);
}

function loginRedirect(req: NextRequest, status: "verified" | "invalid") {
  const url = new URL("/login", getVerifyOrigin(req));
  url.searchParams.set("email", status);
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const ip = getClientIp(req);
    const guard = await enforceRateLimit(req, {
      key: `auth:verify_email:${userId}:${ip}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      strict: true,
      route: "auth/verify-email",
      method: "POST",
      operation: "send_verification",
      userId,
      message: "Too many verification emails. Please retry later.",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const user = await User.findById(userId).select(
      "_id username email email_verified_at",
    );
    if (!user) return jsonError("UNAUTHORIZED", "User not found", 401);
    if (!user.email) {
      return jsonError("EMAIL_REQUIRED", "Add a recovery email first", 400);
    }
    if (user.email_verified_at) {
      return jsonOk({ message: "Email already verified" });
    }

    await EmailVerificationToken.updateMany(
      { user_id: user._id, used_at: null },
      { $set: { used_at: new Date() } },
    );

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await EmailVerificationToken.create({
      user_id: user._id,
      email: user.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const verifyUrl = `${getVerifyOrigin(req)}/api/auth/verify-email?token=${token}`;
    await sendBrevoEmail({
      to: [{ email: user.email, name: user.username }],
      subject: "Verify your Chronicle email",
      htmlContent: [
        "<p>Verify this email address for your Chronicle account.</p>",
        `<p><a href="${verifyUrl}">Verify email</a></p>`,
        "<p>This link expires in 24 hours. If you did not request it, ignore this email.</p>",
      ].join(""),
      textContent: [
        "Verify this email address for your Chronicle account.",
        `Verify email: ${verifyUrl}`,
        "This link expires in 24 hours. If you did not request it, ignore this email.",
      ].join("\n\n"),
    });

    return jsonOk({ message: "Verification email sent" });
  } catch (err) {
    logInternalError("verify_email_send_error", err, {
      route: "auth/verify-email",
      method: "POST",
    });
    return jsonError(
      "VERIFY_EMAIL_INTERNAL_ERROR",
      "Could not send verification email",
      500,
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = String(req.nextUrl.searchParams.get("token") || "");
    if (!token) return loginRedirect(req, "invalid");

    await connectDB();
    const tokenHash = hashVerificationToken(token);
    const verification = await EmailVerificationToken.findOne({
      token_hash: tokenHash,
      used_at: null,
      expires_at: { $gt: new Date() },
    });

    if (!verification) return loginRedirect(req, "invalid");

    const user = await User.findOneAndUpdate(
      {
        _id: verification.user_id,
        email: verification.email,
      },
      { email_verified_at: new Date() },
      { new: true },
    ).select("_id");

    verification.used_at = new Date();
    await verification.save();

    return loginRedirect(req, user ? "verified" : "invalid");
  } catch (err) {
    logInternalError("verify_email_consume_error", err, {
      route: "auth/verify-email",
      method: "GET",
    });
    return loginRedirect(req, "invalid");
  }
}
