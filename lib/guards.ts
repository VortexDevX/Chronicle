import { NextRequest, NextResponse } from "next/server";
import { getAuthTokenClaims } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { jsonError } from "@/lib/http";
import { logSecurityEvent } from "@/lib/log";
import { checkRateLimit, checkRateLimitStrict, getClientIp } from "@/lib/rateLimit";

type RateLimitGuardOptions = {
  key: string;
  limit: number;
  windowMs: number;
  strict?: boolean;
  route: string;
  method: string;
  operation?: string;
  message?: string;
  userId?: string | null;
};

export async function requireAuthUserId(
  req: NextRequest,
): Promise<{ userId: string | null; errorResponse?: NextResponse }> {
  const claims = getAuthTokenClaims(req);
  if (!claims) {
    return { userId: null, errorResponse: jsonError("UNAUTHORIZED", "Unauthorized", 401) };
  }

  await connectDB();
  const user = (await User.findById(claims.userId)
    .select("_id auth_version")
    .lean()) as { auth_version?: number } | null;
  if (!user) {
    return { userId: null, errorResponse: jsonError("UNAUTHORIZED", "Unauthorized", 401) };
  }

  const authVersion =
    typeof user.auth_version === "number" && user.auth_version >= 0
      ? user.auth_version
      : 0;

  if (authVersion !== claims.authVersion) {
    return { userId: null, errorResponse: jsonError("UNAUTHORIZED", "Session expired", 401) };
  }

  return { userId: claims.userId };
}

export async function enforceRateLimit(
  req: NextRequest,
  options: RateLimitGuardOptions,
): Promise<{ allowed: boolean; errorResponse?: NextResponse }> {
  const ip = getClientIp(req);
  const check = options.strict ? checkRateLimitStrict : checkRateLimit;
  const result = await check(options.key, options.limit, options.windowMs);

  if (result.allowed) return { allowed: true };

  logSecurityEvent("rate_limit_block", {
    route: options.route,
    method: options.method,
    op: options.operation,
    ip,
    user_id: options.userId,
    retry_after_sec: result.retryAfterSec,
  });

  return {
    allowed: false,
    errorResponse: jsonError(
      "RATE_LIMITED",
      options.message || `Too many requests. Retry in ${result.retryAfterSec}s`,
      429,
    )
  };
}
