/** Application state store – reactive Store + cover cache */
import { Store, type AppState } from "./core.js";
import type { CoverCacheEntry } from "../types/media.js";

// ── Create the single store instance ─────────────────────────────
const initialState: AppState = {
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
  media: [],
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
  globalStats: null,
};

export const store = new Store(initialState);
export { store as state }; // ← temporary alias so old files still work

// ── Cover Image Cache (your original code, unchanged) ─────────────
const COVER_CACHE_KEY = "chronicle:cover-cache:v3";
const COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const COVER_CACHE_NULL_TTL_MS = 1000 * 60 * 30;
const COVER_CACHE_MAX = 600;

export const coverCache = new Map<string, CoverCacheEntry>();
export let coverQueue: { title: string; id: string; mangadexId?: string }[] =
  [];
export let coverProcessing = false;

export function setCoverProcessing(val: boolean) {
  coverProcessing = val;
}

export function loadCoverCache(): void {
  try {
    const raw = localStorage.getItem(COVER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CoverCacheEntry>;
    const now = Date.now();
    Object.entries(parsed).forEach(([title, entry]) => {
      if (!entry || typeof entry.ts !== "number") return;
      const ttl = entry.url ? COVER_CACHE_TTL_MS : COVER_CACHE_NULL_TTL_MS;
      if (now - entry.ts > ttl) return;
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
  const ttl = entry.url ? COVER_CACHE_TTL_MS : COVER_CACHE_NULL_TTL_MS;
  if (Date.now() - entry.ts > ttl) {
    coverCache.delete(title);
    persistCoverCache();
    return undefined;
  }
  return entry.url;
}

export function setCachedCover(title: string, url: string | null): void {
  coverCache.set(title, { url, ts: Date.now() });
  persistCoverCache();
}

export async function processCoverQueue(): Promise<void> {
  if (coverProcessing || coverQueue.length === 0) return;
  coverProcessing = true;
  while (coverQueue.length > 0) {
    const { title, id, mangadexId } = coverQueue.shift()!;
    const cacheKey = mangadexId ? `md-${mangadexId}` : title;
    if (getCachedCover(cacheKey) !== undefined) continue;
    try {
      let imageUrl: string | null = null;
      if (mangadexId) {
        const res = await fetch(
          `https://api.mangadex.org/manga/${mangadexId}?includes[]=cover_art`,
        );
        if (res.ok) {
          const json = await res.json();
          const coverArt = json.data?.relationships?.find(
            (r: any) => r.type === "cover_art",
          );
          if (coverArt?.attributes?.fileName) {
            imageUrl = `https://uploads.mangadex.org/covers/${mangadexId}/${coverArt.attributes.fileName}.512.jpg`;
          }
        }
      } else {
        const res = await fetch(
          `/api/anime-cover?title=${encodeURIComponent(title)}`,
        );
        if (res.ok) {
          const json = await res.json();
          imageUrl = json?.imageUrl || null;
        }
      }
      setCachedCover(cacheKey, imageUrl);
      if (imageUrl) {
        const thumbEl = document.querySelector(
          `[data-cover-id="${id}"]`,
        ) as HTMLElement;
        if (thumbEl) {
          thumbEl.style.backgroundImage = `url(${imageUrl})`;
          thumbEl.classList.add("thumb-loaded");
        }
      }
    } catch {
      setCachedCover(cacheKey, null);
    }
    await new Promise((r) => setTimeout(r, mangadexId ? 250 : 1100));
  }
  coverProcessing = false;
}

export function queueCoverFetch(
  title: string,
  id: string,
  mangadexId?: string,
): void {
  const cacheKey = mangadexId ? `md-${mangadexId}` : title;
  if (getCachedCover(cacheKey) !== undefined) return;
  if (
    !coverQueue.some((q) =>
      mangadexId ? q.mangadexId === mangadexId : q.title === title,
    )
  ) {
    coverQueue.push({ title, id, mangadexId });
    processCoverQueue();
  }
}
