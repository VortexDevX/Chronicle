/**
 * Rate limiter with provider abstraction.
 *
 * Providers:
 *  - MemoryProvider  — per-instance, works everywhere (dev/single-instance)
 *  - UpstashProvider — distributed via Upstash Redis (production)
 *
 * Auto-selects based on env vars. Falls back to memory if Upstash is not configured.
 */

import { NextRequest } from "next/server";
import { logInfo, logInternalError } from "@/lib/log";

// ── Types ──────────────────────────────────────────────────────────

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type RateLimitMode = "fail_open" | "fail_closed";

interface RateLimiterProvider {
  check(
    key: string,
    limit: number,
    windowMs: number,
    mode: RateLimitMode,
  ): Promise<RateLimitResult>;
}

// ── Memory Provider ────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };

class MemoryProvider implements RateLimiterProvider {
  private buckets = new Map<string, Bucket>();

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSec: Math.ceil(windowMs / 1000),
      };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    this.buckets.set(key, existing);
    return {
      allowed: true,
      remaining: Math.max(0, limit - existing.count),
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
}

// ── Upstash Provider ───────────────────────────────────────────────

class UpstashProvider implements RateLimiterProvider {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
  }

  private async redis(command: string[]): Promise<unknown> {
    const res = await fetch(`${this.url}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
    const json = await res.json();
    return json.result;
  }

  async check(
    key: string,
    limit: number,
    windowMs: number,
    mode: RateLimitMode,
  ): Promise<RateLimitResult> {
    try {
      const redisKey = `rl:${key}`;
      const windowSec = Math.ceil(windowMs / 1000);

      // INCR + EXPIRE pattern
      const count = (await this.redis(["INCR", redisKey])) as number;

      if (count === 1) {
        // First hit — set expiry
        await this.redis(["EXPIRE", redisKey, String(windowSec)]);
      }

      if (count > limit) {
        const ttl = ((await this.redis(["TTL", redisKey])) as number) || windowSec;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, ttl),
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, limit - count),
        retryAfterSec: windowSec,
      };
    } catch (err) {
      if (mode === "fail_closed") {
        logInternalError("rate_limit_upstash_error", err, { mode: "fail_closed" });
        return { allowed: false, remaining: 0, retryAfterSec: 60 };
      }

      // Fall through to allow on Redis failure (explicit fail-open mode)
      logInternalError("rate_limit_upstash_error", err, { mode: "fail_open" });
      return { allowed: true, remaining: limit, retryAfterSec: 0 };
    }
  }
}

// ── Provider Singleton ─────────────────────────────────────────────

let provider: RateLimiterProvider | null = null;

function getProvider(): RateLimiterProvider {
  if (provider) return provider;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    provider = new UpstashProvider(url, token);
    logInfo("rate_limit_provider_selected", { provider: "upstash" });
  } else {
    provider = new MemoryProvider();
    logInfo("rate_limit_provider_selected", { provider: "memory" });
  }

  return provider;
}

// ── Public API ─────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return getProvider().check(key, limit, windowMs, "fail_open");
}

export async function checkRateLimitStrict(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return getProvider().check(key, limit, windowMs, "fail_closed");
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  
  return (
    req.headers.get("client-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
