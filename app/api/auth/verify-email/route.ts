import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EmailVerificationToken, User } from "@/lib/models";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { getPrimaryAppOrigin } from "@/lib/origin";
import { logInternalError } from "@/lib/log";
import {
  createAndSendVerificationEmail,
  hashVerificationToken,
} from "@/lib/verification";

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

    const sent = await createAndSendVerificationEmail({
      userId: user._id,
      email: user.email,
      username: user.username,
      originFallback: req.nextUrl.origin,
      isWelcome: false,
    });

    if (!sent) {
      return jsonError(
        "VERIFY_EMAIL_INTERNAL_ERROR",
        "Could not send verification email",
        500,
      );
    }

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
