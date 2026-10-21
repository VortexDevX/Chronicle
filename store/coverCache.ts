import type { CoverCacheEntry, MediaItem } from "@/types/media";

const COVER_CACHE_KEY = "chronicle:cover-cache:v7";
const COVER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COVER_CACHE_NULL_TTL_MS = 10 * 60 * 1000;
const ANIME_COVER_NULL_TTL_MS = 60 * 1000;
const COVER_CACHE_MAX = 1000;
const COVER_REQUEST_INTERVAL_MS = 1100;
const COVER_REQUEST_CONCURRENCY = 4;

type CoverRequest = {
  key: string;
  media: MediaCoverRequest;
  force: boolean;
  resolve: (url: string | null) => void;
};

export type MediaCoverRequest = Pick<
  MediaItem,
  "title" | "media_type" | "mangadex_id" | "anilist_id"
>;

const cache = new Map<string, CoverCacheEntry>();
const pending = new Map<string, Promise<string | null>>();
const requestQueue: CoverRequest[] = [];
let cacheLoaded = false;
let activeRequests = 0;
const nextRequestSlots = new Map<string, number>();

function normalizedTitle(title: string): string {
  return title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function getCacheTtl(key: string, url: string | null): number {
  if (url) return COVER_CACHE_TTL_MS;
  return key.startsWith("anime:") ? ANIME_COVER_NULL_TTL_MS : COVER_CACHE_NULL_TTL_MS;
}

function getCoverKey(media: MediaCoverRequest): string {
  if (media.media_type === "Manhwa") {
    return media.mangadex_id
      ? `manhwa:md:${media.mangadex_id}`
      : `manhwa:title:${normalizedTitle(media.title)}`;
  }

  if (media.media_type === "Anime" || media.media_type === "Donghua") {
    return media.anilist_id
      ? `anime:al:${media.anilist_id}`
      : `anime:title:${normalizedTitle(media.title)}`;
  }

  return `${media.media_type.toLocaleLowerCase()}:title:${normalizedTitle(media.title)}`;
}

function ensureCacheLoaded(): void {
  if (cacheLoaded || typeof window === "undefined") return;
  cacheLoaded = true;

  try {
    const raw = window.localStorage.getItem(COVER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CoverCacheEntry>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.ts !== "number") continue;
      const ttl = getCacheTtl(key, entry.url || null);
      if (now - entry.ts <= ttl) cache.set(key, { url: entry.url || null, ts: entry.ts });
    }
  } catch {
    // Ignore damaged or unavailable browser storage.
  }
}

function persistCache(): void {
  if (typeof window === "undefined") return;
  try {
    const entries = [...cache.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, COVER_CACHE_MAX);
    window.localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage is an optimization; covers still work without it.
  }
}

function readCache(key: string): string | null | undefined {
  ensureCacheLoaded();
  const entry = cache.get(key);
  if (!entry) return undefined;
  const ttl = getCacheTtl(key, entry.url);
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return undefined;
  }
  return entry.url;
}

function writeCache(key: string, url: string | null): void {
  cache.set(key, { url, ts: Date.now() });
  persistCache();
}

async function acquireRequestSlot(route: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequestSlots.get(route) || 0);
  nextRequestSlots.set(route, slot + COVER_REQUEST_INTERVAL_MS);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

async function fetchProviderUrl(path: string, force: boolean): Promise<string | null> {
  const url = new URL(path, window.location.origin);
  if (force) url.searchParams.set("retry", String(Date.now()));
  const requestPath = `${url.pathname}${url.search}`;
  const route = path.startsWith("/api/manga-cover") ? "manga" : "anime";
  const send = async () => {
    await acquireRequestSlot(route);
    return fetch(requestPath, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  };

  let response = await send();
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After")) || 5;
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 60) * 1000));
    response = await send();
  }
  if (!response.ok) throw new Error(`Cover lookup failed with ${response.status}`);
  const result = await response.json();
  return result?.data?.imageUrl || result?.imageUrl || null;
}

async function fetchCover(media: MediaCoverRequest, force: boolean): Promise<string | null> {
  if (media.media_type !== "Manhwa" && media.media_type !== "Anime" && media.media_type !== "Donghua") {
    return null;
  }

  const query = new URLSearchParams();
  const endpoint = media.media_type === "Manhwa" ? "/api/manga-cover" : "/api/anime-cover";

  if (media.media_type === "Manhwa") {
    let imageUrl: string | null = null;
    if (media.mangadex_id) {
      query.set("id", media.mangadex_id);
      imageUrl = await fetchProviderUrl(`${endpoint}?${query.toString()}`, force);
    }

    if (!imageUrl) {
      query.delete("id");
      query.set("title", media.title);
      imageUrl = await fetchProviderUrl(`${endpoint}?${query.toString()}`, force);
    }
    return imageUrl ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}` : null;
  }

  query.set("title", media.title);
  if (media.anilist_id && Number.isInteger(media.anilist_id) && media.anilist_id > 0) {
    query.set("anilist_id", String(media.anilist_id));
  }
  const imageUrl = await fetchProviderUrl(`${endpoint}?${query.toString()}`, force);
  if (!imageUrl) return null;
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

async function processQueueItem(item: CoverRequest): Promise<void> {
  try {
    const url = await fetchCover(item.media, item.force);
    writeCache(item.key, url);
    item.resolve(url);
  } catch {
    // Do not cache network/rate-limit failures as "no cover". A later visit can retry.
    item.resolve(null);
  } finally {
    pending.delete(item.key);
    activeRequests -= 1;
    pumpQueue();
  }
}

function pumpQueue(): void {
  while (activeRequests < COVER_REQUEST_CONCURRENCY && requestQueue.length > 0) {
    const item = requestQueue.shift();
    if (!item) return;
    activeRequests += 1;
    void processQueueItem(item);
  }
}

function resolveProviderCover(media: MediaCoverRequest, force = false): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  ensureCacheLoaded();
  const key = getCoverKey(media);

  const existing = pending.get(key);
  if (existing) return existing;

  if (!force) {
    const cached = readCache(key);
    if (cached !== undefined) return Promise.resolve(cached);
  } else {
    cache.delete(key);
  }

  const request = new Promise<string | null>((resolve) => {
    requestQueue.push({ key, media, force, resolve });
  });
  pending.set(key, request);
  pumpQueue();
  return request;
}

export function loadCoverCache(): void {
  ensureCacheLoaded();
}

export function getMediaCover(media: MediaCoverRequest): Promise<string | null> {
  return resolveProviderCover(media);
}

export function retryMediaCover(media: MediaCoverRequest): Promise<string | null> {
  return resolveProviderCover(media, true);
}
