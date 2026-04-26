import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken } from "./auth.js";
import { jsonError } from "./http.js";
import { logSecurityEvent } from "./log.js";
import {
  checkRateLimit,
  checkRateLimitStrict,
  getClientIp,
} from "./rateLimit.js";

type RateLimitGuardOptions = {
  key: string;
  limit: number;
  windowMs: number;
  strict?: boolean;
  route: string;
  method: string;
  operation?: string;
  message?: string;
  userId?: string;
};

export function requireAuthUserId(
  req: VercelRequest,
  res: VercelResponse,
): string | null {
  const userId = verifyToken(req.headers.authorization);
  if (!userId) {
    jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
    return null;
  }
  return userId;
}

export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  options: RateLimitGuardOptions,
): Promise<boolean> {
  const ip = getClientIp(req);
  const check = options.strict ? checkRateLimitStrict : checkRateLimit;
  const result = await check(options.key, options.limit, options.windowMs);

  if (result.allowed) return true;

  logSecurityEvent("rate_limit_block", {
    route: options.route,
    method: options.method,
    op: options.operation,
    ip,
    user_id: options.userId,
    retry_after_sec: result.retryAfterSec,
  });

  jsonError(
    res,
    "RATE_LIMITED",
    options.message || `Too many requests. Retry in ${result.retryAfterSec}s`,
    429,
  );

  return false;
}
