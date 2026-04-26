/** Selectors – derived state for performance (Phase 3) */
import { store } from "./store.js";
import type { MediaItem } from "../types/media.js";

type FilterCache = {
  mediaRev: number;
  search: string;
  filterType: string;
  filterStatus: string;
  sortBy: string;
  result: MediaItem[];
};

type StatsCache = {
  mediaRev: number;
  search: string;
  filterType: string;
  filterStatus: string;
  sortBy: string;
  result: ReturnType<typeof buildStats>;
};

let filterCache: FilterCache | null = null;
let statsCache: StatsCache | null = null;

function buildFilteredMedia(): MediaItem[] {
  const state = store.get();
  let filtered = [...state.media];

  if (state.search.trim()) {
    const term = state.search.toLowerCase().trim();
    filtered = filtered.filter((m) => m.title.toLowerCase().includes(term));
  }

  if (state.filterType) {
    filtered = filtered.filter((m) => m.media_type === state.filterType);
  }

  if (state.filterStatus) {
    filtered = filtered.filter((m) => m.status === state.filterStatus);
  }

  filtered.sort((a, b) => {
    switch (state.sortBy) {
      case "progress":
        return (
          b.progress_current / (b.progress_total || 1) -
          a.progress_current / (a.progress_total || 1)
        );
      case "rating":
        return (b.rating || 0) - (a.rating || 0);
      case "title":
        return a.title.localeCompare(b.title);
      case "last_updated":
      default:
        return (
          new Date(b.last_updated).getTime() -
          new Date(a.last_updated).getTime()
        );
    }
  });

  return filtered;
}

function buildStats(media: MediaItem[]) {
  const total = media.length;

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;

  media.forEach((m) => {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byType[m.media_type] = (byType[m.media_type] || 0) + 1;
    if (m.rating) {
      ratingSum += m.rating;
      ratingCount++;
    }
  });

  const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";

  return {
    total,
    byStatus,
    byType,
    avgRating,
    watching: byStatus["Watching/Reading"] || 0,
    completed: byStatus["Completed"] || 0,
    planned: byStatus["Planned"] || 0,
    onHold: byStatus["On Hold"] || 0,
    dropped: byStatus["Dropped"] || 0,
  };
}

export const selectors = {
  /** Filtered and sorted media list */
  getFilteredMedia(): MediaItem[] {
    const state = store.get();

    if (
      filterCache &&
      filterCache.mediaRev === state.mediaRev &&
      filterCache.search === state.search &&
      filterCache.filterType === state.filterType &&
      filterCache.filterStatus === state.filterStatus &&
      filterCache.sortBy === state.sortBy
    ) {
      return filterCache.result;
    }

    const result = buildFilteredMedia();
    filterCache = {
      mediaRev: state.mediaRev,
      search: state.search,
      filterType: state.filterType,
      filterStatus: state.filterStatus,
      sortBy: state.sortBy,
      result,
    };

    return result;
  },

  /** Computed stats */
  getStats() {
    const state = store.get();

    if (
      statsCache &&
      statsCache.mediaRev === state.mediaRev &&
      statsCache.search === state.search &&
      statsCache.filterType === state.filterType &&
      statsCache.filterStatus === state.filterStatus &&
      statsCache.sortBy === state.sortBy
    ) {
      return statsCache.result;
    }

    const result = buildStats(selectors.getFilteredMedia());
    statsCache = {
      mediaRev: state.mediaRev,
      search: state.search,
      filterType: state.filterType,
      filterStatus: state.filterStatus,
      sortBy: state.sortBy,
      result,
    };

    return result;
  },
};
