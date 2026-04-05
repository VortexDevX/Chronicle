/** Media API helpers. */

import { apiFetch } from "./client.js";
import { state } from "../state/store.js";

export async function fetchMedia(
  reset = true,
  background = false,
): Promise<void> {
  if (reset) {
    state.page = 1;
    if (!background) {
      state.media = [];
      state.total = 0;
      state.loading = true;
    }
    state.hasMore = false;
    state.loadingMore = false;
  } else {
    state.loadingMore = true;
  }

  try {
    const query = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
      sort_by: state.sortBy,
    });
    if (state.search.trim()) query.set("search", state.search.trim());
    if (state.filterType) query.set("media_type", state.filterType);
    if (state.filterStatus) query.set("status", state.filterStatus);

    const payload = await apiFetch(`/media?${query.toString()}`);
    const items = Array.isArray(payload) ? payload : payload.items || [];

    if (reset) state.media = items;
    else state.media = [...state.media, ...items];

    state.total = Array.isArray(payload)
      ? items.length
      : payload.total || items.length;
    state.hasMore = Array.isArray(payload) ? false : Boolean(payload.has_more);

    if (!Array.isArray(payload)) {
      state.page = Number(payload.page || state.page);
    }

    const available = new Set(state.media.map((m) => m._id));
    state.selectedIds.forEach((id) => {
      if (!available.has(id)) state.selectedIds.delete(id);
    });
  } catch {
    // Error shown by caller via toast
    throw new Error("Failed to load your entries. Please try again.");
  } finally {
    state.loading = false;
    state.loadingMore = false;
  }
}
