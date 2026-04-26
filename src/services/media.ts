/** Media service layer — all business logic and API calls live here (Phase 2) */
import { store } from "../state/store.js";
import { apiFetch } from "../api/client.js";
import type { MediaItem } from "../types/media.js";
import type { GlobalStats } from "../state/core.js";

const STATS_REFRESH_TTL_MS = 30_000;
let lastStatsFetchAt = 0;
let statsInFlight: Promise<void> | null = null;

async function refreshStatsIfStale(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastStatsFetchAt < STATS_REFRESH_TTL_MS) return;
  if (statsInFlight) return statsInFlight;

  statsInFlight = (async () => {
    try {
      const data = (await apiFetch(`/stats`)) as GlobalStats | null;
      if (data) {
        store.set((prev) => ({ ...prev, globalStats: data }));
        lastStatsFetchAt = Date.now();
      }
    } catch (err) {
      console.error("Stats fetch failed:", err);
    } finally {
      statsInFlight = null;
    }
  })();

  return statsInFlight;
}

export async function fetchMedia(
  reset = true,
  background = false,
): Promise<void> {
  // Single loading set — covers both reset and load-more cases
  store.set((prev) => ({
    ...prev,
    ...(reset
      ? {
          page: 1,
          media: background ? prev.media : [],
          total: background ? prev.total : 0,
          hasMore: false,
          loading: !background,
          mediaRev: background ? prev.mediaRev : prev.mediaRev + 1,
        }
      : {}),
    loadingMore: !reset,
  }));

  try {
    const current = store.get();
    const query = new URLSearchParams({
      page: String(current.page),
      limit: String(current.limit),
      sort_by: current.sortBy,
    });
    if (current.search.trim()) query.set("search", current.search.trim());
    if (current.filterType) query.set("media_type", current.filterType);
    if (current.filterStatus) query.set("status", current.filterStatus);

    const payload = (await apiFetch(`/media?${query.toString()}`)) as
      | { items?: MediaItem[]; total?: number; has_more?: boolean; page?: number }
      | MediaItem[];
    const items: MediaItem[] = Array.isArray(payload) ? payload : payload.items || [];

    // Single data set — includes loading cleanup
    store.set((prev) => {
      const newMedia = reset ? items : [...prev.media, ...items];
      return {
        ...prev,
        media: newMedia,
        mediaRev: prev.mediaRev + 1,
        total: Array.isArray(payload)
          ? items.length
          : payload.total || items.length,
        hasMore: Array.isArray(payload) ? false : Boolean(payload.has_more),
        page: Array.isArray(payload)
          ? prev.page
          : Number(payload.page || prev.page),
        loading: false,
        loadingMore: false,
      };
    });

    store.updateSelectedIds((set) => {
      const available = new Set(store.get().media.map((m) => m._id));
      set.forEach((id) => {
        if (!available.has(id)) set.delete(id);
      });
    });

    void refreshStatsIfStale();
  } catch (err) {
    console.error(err);
    store.set((prev) => ({
      ...prev,
      loading: false,
      loadingMore: false,
    }));
    throw new Error("Failed to load your entries. Please try again.");
  }
}

export async function updateMedia(
  id: string,
  payload: Record<string, unknown>,
  refetch = true,
): Promise<void> {
  await apiFetch(`/media?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (refetch) await fetchMedia(true, true);
}

export async function deleteMedia(id: string): Promise<void> {
  await apiFetch(`/media?id=${id}`, { method: "DELETE" });
  await fetchMedia(true, true);
}

export async function fetchStats(force = false): Promise<void> {
  await refreshStatsIfStale(force);
}
