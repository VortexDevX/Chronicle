const FALLBACK_SITE_URL = "https://chroniclex.vercel.app";

function normalizeSiteUrl(value: string | undefined) {
  if (!value) return FALLBACK_SITE_URL;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return FALLBACK_SITE_URL;
    }

    return `${url.protocol}//${url.host}`;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const siteConfig = {
  name: "Chronicle X",
  shortName: "Chronicle",
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL),
  description:
    "Store anime watchlists and manhwa, donghua, and light novel reading lists in one private media tracker with progress, shelves, covers, updates, and stats.",
  creator: "VortexDevX",
  creatorUrl: "https://github.com/VortexDevX",
  updatedAt: "2026-08-01",
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, `${siteConfig.url}/`).toString();
}
