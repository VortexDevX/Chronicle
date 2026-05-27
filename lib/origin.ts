export function getAppOrigins(): string[] {
  return String(process.env.APP_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function getPrimaryAppOrigin(fallback: string): string {
  return getAppOrigins()[0] || fallback.replace(/\/$/, "");
}

export function getAllowedCorsOrigin(requestOrigin: string | null): string | null {
  const configuredOrigins = getAppOrigins();

  if (configuredOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") return null;
    return requestOrigin;
  }

  if (!requestOrigin) return null;
  const normalizedOrigin = requestOrigin.trim().replace(/\/$/, "");
  return configuredOrigins.includes(normalizedOrigin) ? normalizedOrigin : null;
}
