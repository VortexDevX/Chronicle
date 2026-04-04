/** Application state store. */

import type { MediaItem, CoverCacheEntry } from "../types/media.js";

export const state = {
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
  media: [] as MediaItem[],
  search: "",
  filterType: "",
  filterStatus: "",
  sortBy: "last_updated",
  loading: false,
  loadingMore: false,
  page: 1,
  limit: 24,
  hasMore: false,
  total: 0,
  bulkMode: false,
  selectedIds: new Set<string>(),
};

// ── Cover Image Cache (Jikan API) ────────────────────────────────

const COVER_CACHE_KEY = "chronicle:cover-cache:v2";
const COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const COVER_CACHE_MAX = 600;

export const coverCache = new Map<string, CoverCacheEntry>();
export let jikanQueue: { title: string; id: string }[] = [];
export let jikanProcessing = false;
export function setJikanProcessing(val: boolean) {
  jikanProcessing = val;
}

export function loadCoverCache(): void {
  try {
    const raw = localStorage.getItem(COVER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CoverCacheEntry>;
    const now = Date.now();
    Object.entries(parsed).forEach(([title, entry]) => {
      if (!entry || typeof entry.ts !== "number") return;
      if (now - entry.ts > COVER_CACHE_TTL_MS) return;
      coverCache.set(title, { url: entry.url ?? null, ts: entry.ts });
    });
  } catch {
    // Ignore corrupt cache payload
  }
}

export function persistCoverCache(): void {
  try {
    const entries = Array.from(coverCache.entries());
    const trimmed = entries
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, COVER_CACHE_MAX);
    const payload = Object.fromEntries(trimmed);
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota and serialization errors
  }
}

export function getCachedCover(title: string): string | null | undefined {
  const entry = coverCache.get(title);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > COVER_CACHE_TTL_MS) {
    coverCache.delete(title);
    return undefined;
  }
  return entry.url;
}

export function setCachedCover(title: string, url: string | null): void {
  coverCache.set(title, { url, ts: Date.now() });
  persistCoverCache();
}

export async function processJikanQueue(): Promise<void> {
  if (jikanProcessing || jikanQueue.length === 0) return;
  jikanProcessing = true;

  while (jikanQueue.length > 0) {
    const { title, id } = jikanQueue.shift()!;
    if (getCachedCover(title) !== undefined) continue;

    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
      );
      if (res.ok) {
        const json = await res.json();
        const imageUrl =
          json.data?.[0]?.images?.jpg?.large_image_url || null;
        setCachedCover(title, imageUrl);

        // Update the specific card thumbnail if element exists
        const thumbEl = document.querySelector(
          `[data-cover-id="${id}"]`,
        ) as HTMLElement;
        if (thumbEl && imageUrl) {
          thumbEl.style.backgroundImage = `url(${imageUrl})`;
          thumbEl.classList.add("thumb-loaded");
        }
      } else {
        setCachedCover(title, null);
      }
    } catch {
      setCachedCover(title, null);
    }

    // Rate limit: 1 request per second (Jikan limit)
    await new Promise((r) => setTimeout(r, 1100));
  }

  jikanProcessing = false;
}

export function queueCoverFetch(title: string, id: string): void {
  if (getCachedCover(title) !== undefined) return;
  if (!jikanQueue.some((q) => q.title === title)) {
    jikanQueue.push({ title, id });
    processJikanQueue();
  }
}
