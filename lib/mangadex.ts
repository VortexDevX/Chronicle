const MANGADEX_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MANGADEX_HOSTS = new Set([
  "mangadex.org",
  "www.mangadex.org",
  "api.mangadex.org",
]);

/** Accept a MangaDex UUID or copied title/API URL and return its canonical UUID. */
export function normalizeMangaDexId(value: unknown): string | null {
  const input = String(value || "").trim();
  if (!input) return null;
  if (MANGADEX_ID_PATTERN.test(input)) return input.toLowerCase();

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !MANGADEX_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const resourceIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "title" || segment.toLowerCase() === "manga",
  );
  const candidate = resourceIndex >= 0 ? segments[resourceIndex + 1] : undefined;
  return candidate && MANGADEX_ID_PATTERN.test(candidate)
    ? candidate.toLowerCase()
    : null;
}
