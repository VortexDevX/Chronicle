import { CoverCacheEntry } from "@/types/media";

const COVER_CACHE_KEY = "chronicle:cover-cache:v5";
const COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const COVER_CACHE_NULL_TTL_MS = 1000 * 60 * 30;
const COVER_CACHE_MAX = 600;
const COVER_FETCH_BATCH_DELAY_MS = 700;

export const coverCache = new Map<string, CoverCacheEntry>();
export let coverQueue: { title: string; id: string; mangadexId?: string }[] = [];
export let coverProcessing = false;

let coverCacheDirty = false;
let coverCacheTimer: ReturnType<typeof setTimeout> | null = null;
let coverQueueRun = 0;
let coverAbortController: AbortController | null = null;

function scheduleCoverPersist(): void {
  if (typeof window === "undefined") return;
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
  if (typeof window === "undefined") return;
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
  if (typeof window === "undefined") return;
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
  if (typeof window === "undefined") return;
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
  if (typeof window === "undefined") return undefined;
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
  if (typeof window === "undefined") return;
  coverCache.set(title, { url, ts: Date.now() });
  scheduleCoverPersist();
}

export function resetCoverQueue(): void {
  if (typeof window === "undefined") return;
  coverQueueRun += 1;
  coverQueue = [];
  coverAbortController?.abort();
  coverAbortController = null;
  coverProcessing = false;
}

async function fetchMangaCover(
  title: string,
  mangadexId?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams();
  if (mangadexId) params.set("id", mangadexId);
  else params.set("title", title);

  const res = await fetch(`/api/manga-cover?${params}`, { signal });
  if (!res.ok) return null;
  const json = await res.json();
  const url = json?.data?.imageUrl || json?.imageUrl || null;
  return url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : null;
}

async function fetchAnimeCover(title: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`/api/anime-cover?title=${encodeURIComponent(title)}`, { signal });
  if (!res.ok) return null;
  const json = await res.json();
  const url = json?.data?.imageUrl || json?.imageUrl || null;
  return url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : null;
}

function applyCoverToThumb(id: string, imageUrl: string): void {
  if (typeof window === "undefined") return;
  const thumbEl = document.querySelector(`[data-cover-id="${id}"]`) as HTMLElement;
  if (!thumbEl) return;
  thumbEl.style.backgroundImage = `url(${imageUrl})`;
  thumbEl.classList.add("thumb-loaded");
}

export async function processCoverQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  if (coverProcessing || coverQueue.length === 0) return;
  coverProcessing = true;
  const run = coverQueueRun;
  const controller = new AbortController();
  coverAbortController = controller;

  try {
    while (coverQueue.length > 0 && run === coverQueueRun && !controller.signal.aborted) {
      const item = coverQueue.shift();
      if (!item) continue;
      const { title, id, mangadexId } = item;
      const cacheKey = mangadexId ? `md-${mangadexId}` : title;
      if (getCachedCover(cacheKey) === undefined) {
        try {
          const imageUrl = mangadexId
            ? await fetchMangaCover(title, mangadexId, controller.signal)
            : await fetchAnimeCover(title, controller.signal);
          if (run !== coverQueueRun || controller.signal.aborted) return;
          setCachedCover(cacheKey, imageUrl);
          if (imageUrl) applyCoverToThumb(id, imageUrl);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setCachedCover(cacheKey, null);
        }
      }
      if (coverQueue.length > 0) {
        await new Promise((r) => setTimeout(r, COVER_FETCH_BATCH_DELAY_MS));
      }
    }
  } finally {
    if (coverAbortController === controller) coverAbortController = null;
    coverProcessing = false;
    flushCoverCache();
  }
}

export function queueCoverFetch(
  title: string,
  id: string,
  mangadexId?: string,
): void {
  if (typeof window === "undefined") return;
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
