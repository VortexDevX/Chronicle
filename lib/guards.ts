import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
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

export function requireAuthUserId(
  req: NextRequest,
): { userId: string | null; errorResponse?: NextResponse } {
  const userId = getUser(req);
  if (!userId) {
    return { userId: null, errorResponse: jsonError("UNAUTHORIZED", "Unauthorized", 401) };
  }
  return { userId };
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
