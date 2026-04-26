/** Application state store – reactive Store + cover cache */
import { Store, createInitialState } from "./core.js";
import type { CoverCacheEntry } from "../types/media.js";

// ── Create the single store instance ─────────────────────────────
const initialState = createInitialState({
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
});

export const store = new Store(initialState);

// ── Cover Image Cache ─────────────────────────────────────────────
const COVER_CACHE_KEY = "chronicle:cover-cache:v3";
const COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const COVER_CACHE_NULL_TTL_MS = 1000 * 60 * 30;
const COVER_CACHE_MAX = 600;

export const coverCache = new Map<string, CoverCacheEntry>();
export let coverQueue: { title: string; id: string; mangadexId?: string }[] =
  [];
export let coverProcessing = false;

/** Batched persist — writes at most once every 2s */
let coverCacheDirty = false;
let coverCacheTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCoverPersist(): void {
  coverCacheDirty = true;
  if (!coverCacheTimer) {
    coverCacheTimer = setTimeout(() => {
      if (coverCacheDirty) persistCoverCache();
      coverCacheDirty = false;
      coverCacheTimer = null;
    }, 2000);
  }
}

export function flushCoverCache(): void {
  if (coverCacheDirty) {
    persistCoverCache();
    coverCacheDirty = false;
  }
  if (coverCacheTimer) {
    clearTimeout(coverCacheTimer);
    coverCacheTimer = null;
  }
}

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
    scheduleCoverPersist();
    return undefined;
  }
  return entry.url;
}

export function setCachedCover(title: string, url: string | null): void {
  coverCache.set(title, { url, ts: Date.now() });
  scheduleCoverPersist();
}

async function fetchMangadexCover(mangadexId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.mangadex.org/manga/${mangadexId}?includes[]=cover_art`,
  );
  if (!res.ok) return null;

  const json = await res.json();
  const coverArt = json.data?.relationships?.find(
    (r: { type?: string; attributes?: { fileName?: string } }) =>
      r.type === "cover_art",
  );
  if (!coverArt?.attributes?.fileName) return null;

  return `https://uploads.mangadex.org/covers/${mangadexId}/${coverArt.attributes.fileName}.512.jpg`;
}

async function fetchAnimeCover(title: string): Promise<string | null> {
  const res = await fetch(`/api/anime-cover?title=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.imageUrl || json?.imageUrl || null;
}

function applyCoverToThumb(id: string, imageUrl: string): void {
  const thumbEl = document.querySelector(`[data-cover-id="${id}"]`) as HTMLElement;
  if (!thumbEl) return;
  thumbEl.style.backgroundImage = `url(${imageUrl})`;
  thumbEl.classList.add("thumb-loaded");
}

export async function processCoverQueue(): Promise<void> {
  if (coverProcessing || coverQueue.length === 0) return;
  coverProcessing = true;
  while (coverQueue.length > 0) {
    const { title, id, mangadexId } = coverQueue.shift()!;
    const cacheKey = mangadexId ? `md-${mangadexId}` : title;
    if (getCachedCover(cacheKey) !== undefined) continue;
    try {
      const imageUrl = mangadexId
        ? await fetchMangadexCover(mangadexId)
        : await fetchAnimeCover(title);
      setCachedCover(cacheKey, imageUrl);
      if (imageUrl) {
        applyCoverToThumb(id, imageUrl);
      }
    } catch {
      setCachedCover(cacheKey, null);
    }
    await new Promise((r) => setTimeout(r, mangadexId ? 250 : 1100));
  }
  coverProcessing = false;
  flushCoverCache();
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
