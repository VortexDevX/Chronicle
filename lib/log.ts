type LogMeta = Record<string, string | number | boolean | undefined | null>;

function sanitize(meta: LogMeta = {}): LogMeta {
  const blocked = new Set([
    "password",
    "password_hash",
    "token",
    "authorization",
    "jwt",
    "secret",
  ]);
  const out: LogMeta = {};
  Object.entries(meta).forEach(([k, v]) => {
    if (blocked.has(k.toLowerCase())) return;
    out[k] = v;
  });
  return out;
}

export function logSecurityEvent(event: string, meta: LogMeta = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      kind: "security",
      event,
      ts: new Date().toISOString(),
      meta: sanitize(meta),
    })
  );
}

export function logInfo(event: string, meta: LogMeta = {}) {
  console.info(
    JSON.stringify({
      level: "info",
      kind: "app",
      event,
      ts: new Date().toISOString(),
      meta: sanitize(meta),
    })
  );
}

export function logInternalError(event: string, err: unknown, meta: LogMeta = {}) {
  const errorMessage = err instanceof Error ? err.message : "unknown_error";
  console.error(
    JSON.stringify({
      level: "error",
      kind: "internal",
      event,
      ts: new Date().toISOString(),
      error: errorMessage,
      meta: sanitize(meta),
    })
  );
}

