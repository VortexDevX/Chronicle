import type { VercelRequest, VercelResponse } from "./vercelTypes.js";

/**
 * Centralized CORS + HTTP response utilities.
 *
 * Policy:
 *  - No `Access-Control-Allow-Credentials` (Bearer-token auth doesn't need it).
 *  - Origin is checked against APP_ORIGIN env var (comma-separated allowlist).
 *  - If APP_ORIGIN is unset, allow any origin only in development.
 */

const ALLOWED_METHODS = "GET,OPTIONS,PATCH,DELETE,POST,PUT";
const ALLOWED_HEADERS = [
  "X-Requested-With",
  "Accept",
  "Accept-Version",
  "Content-Length",
  "Content-Type",
  "Date",
  "Authorization",
].join(", ");

function getAllowedOrigins(): string[] {
  const raw = process.env.APP_ORIGIN || "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function resolveOrigin(req: VercelRequest): string {
  const requestOrigin = req.headers.origin || "";
  const allowed = getAllowedOrigins();

  if (allowed.length > 0) {
    return requestOrigin && allowed.includes(requestOrigin)
      ? requestOrigin
      : "null";
  }

  // safer production default: do not reflect arbitrary origins without allowlist
  if (process.env.NODE_ENV === "production") {
    return "null";
  }

  // local/dev convenience
  return requestOrigin || "*";
}

export function setCors(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", resolveOrigin(req));
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
}

export function handleOptions(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function jsonOk(
  res: VercelResponse,
  data: unknown,
  status = 200,
): VercelResponse {
  return res.status(status).json({ ok: true, data });
}

export function jsonError(
  res: VercelResponse,
  code: string,
  message: string,
  status = 400,
): VercelResponse {
  return res.status(status).json({
    ok: false,
    code,
    message,
    error: { code, message },
  });
}
