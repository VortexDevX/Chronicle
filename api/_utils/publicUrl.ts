const MAX_PUBLIC_URL_LENGTH = 500;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    isPrivateIpv4(normalized)
  );
}

/**
 * Normalize user-provided URLs that may later be rendered in public/client UI.
 * Only public http(s) URLs are accepted.
 */
export function normalizePublicHttpUrl(urlStr: string): string | null {
  try {
    if (urlStr.length > MAX_PUBLIC_URL_LENGTH) return null;

    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (isBlockedHostname(parsed.hostname)) {
      return null;
    }

    const normalized = parsed.toString();
    if (normalized.length > MAX_PUBLIC_URL_LENGTH) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}
