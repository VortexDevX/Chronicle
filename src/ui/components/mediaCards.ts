import { store, getCachedCover, queueCoverFetch } from "../../state/store.js";
import { selectors } from "../../state/selectors.js";
import {
  relativeTime,
  daysSince,
  progressLabel,
  escapeHtml,
} from "../../utils/format.js";
import { fetchMedia } from "../../services/media.js";
import { showToast } from "../toast.js";
import { openModal } from "../../features/media/modal.js";

export function renderMediaCards(): void {
  const filteredMedia = selectors.getFilteredMedia();
  const state = store.get();
  const container = document.getElementById("media-grid");
  if (!container) return;

  const loadMoreBtn = document.getElementById("btn-load-more") as HTMLButtonElement | null;

  if (state.loading && state.media.length === 0) {
    const skels = Array(8)
      .fill(0)
      .map((_, i) => `<div class="card skeleton" style="animation-delay:${i * 50}ms; min-height: 180px;"></div>`)
      .join("");
    container.innerHTML = skels;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  const selectedSet = state.selectedIds;
  if (filteredMedia.length === 0) {
    const hasFilters = state.search || state.filterType || state.filterStatus;
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">${hasFilters ? "🔍" : "📚"}</div>
        <h3>${hasFilters ? "No matches found" : "Your chronicle is empty"}</h3>
        <p>${hasFilters ? "Try adjusting your filters or search query." : "Start tracking your first anime, manhwa, or light novel."}</p>
        ${!hasFilters ? `<button class="btn-primary" id="btn-add-empty">+ Add Your First Entry</button>` : ""}
      </div>
    `;
    document.getElementById("btn-add-empty")?.addEventListener("click", () => openModal());
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  container.innerHTML = filteredMedia
    .map((m) => {
      const pct = m.progress_total
        ? Math.min(100, Math.round((m.progress_current / m.progress_total) * 100))
        : 0;
      const unit = progressLabel(m.media_type);
      const ratingStr = m.rating
        ? `<span class="card-rating"><span class="star">★</span>${m.rating}/10</span>`
        : "";
      const totalStr = m.progress_total ? m.progress_total : "?";
      const isStale = m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
      const staleClass = isStale ? " card-stale" : "";
      const staleBadge = isStale
        ? `<span class="badge badge-stale" title="Not updated in ${daysSince(m.last_updated)} days">⏱ STALE</span>`
        : "";
      const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
      let thumbHtml = "";

      if (m.custom_cover_url) {
        thumbHtml = `<div class="card-thumb thumb-loaded" data-cover-id="${m._id}" style="background-image:url('${m.custom_cover_url}')"></div>`;
      } else if (m.media_type === "Manhwa" && m.mangadex_id) {
        const proxiedCover = `/api/cover?mangadex_id=${encodeURIComponent(m.mangadex_id)}`;
        thumbHtml = `<div class="card-thumb thumb-loaded" data-cover-id="${m._id}" style="background-image:url('${proxiedCover}')"></div>`;
      } else {
        const cachedCover = getCachedCover(m.title);
        if (cachedCover && isAnime) {
          thumbHtml = `<div class="card-thumb thumb-loaded" data-cover-id="${m._id}" style="background-image:url('${cachedCover}')"></div>`;
        } else {
          thumbHtml = `<div class="card-thumb" data-cover-id="${m._id}"></div>`;
          if (isAnime) queueCoverFetch(m.title, m._id);
        }
      }

      return `
      <div class="card${staleClass}" data-status="${escapeHtml(m.status)}">
        <div class="card-header">
          ${
            state.bulkMode
              ? `<input type="checkbox" class="bulk-select" data-id="${m._id}" ${selectedSet.has(m._id) ? "checked" : ""} aria-label="Select ${escapeHtml(m.title)}">`
              : ""
          }
          ${thumbHtml}
          <div class="card-header-text">
            <h3 class="truncate" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h3>
            <div class="card-badges">
              <span class="badge badge-type">${escapeHtml(m.media_type)}</span>
              <span class="badge badge-status" data-status="${escapeHtml(m.status)}">${escapeHtml(m.status)}</span>
              ${staleBadge}
            </div>
          </div>
          <span class="card-updated">${relativeTime(m.last_updated)}</span>
        </div>
        <div class="progress-section">
          <div class="progress-row">
            <span class="progress-label">${m.progress_current} / ${totalStr} ${unit}</span>
            <button class="btn-icon btn-increment" data-id="${m._id}" title="Increment progress" aria-label="Add 1 ${unit}">+1</button>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%" data-percent="${pct}"></div>
          </div>
          <div class="card-meta">
            ${ratingStr}
            ${m.progress_total ? `<span class="progress-label">${pct}%</span>` : ""}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-ghost btn-edit" data-id="${m._id}" title="Edit Entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Edit</span>
          </button>
          <button class="btn-danger btn-delete" data-id="${m._id}" title="Delete Entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            <span>Delete</span>
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  if (loadMoreBtn) {
    loadMoreBtn.style.display = state.hasMore ? "inline-flex" : "none";
    loadMoreBtn.disabled = state.loadingMore;
    loadMoreBtn.innerHTML = state.loadingMore ? `<span class="spinner"></span>` : "Load more";
    loadMoreBtn.onclick = async () => {
      if (state.loadingMore || !state.hasMore) return;
      store.set((prev) => ({ ...prev, page: prev.page + 1 }));
      try {
        await fetchMedia(false);
      } catch {
        store.set((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
        showToast("Failed to load more entries.", "error");
      }
    };
  }
}
