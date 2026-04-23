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

  const loadMoreBtn = document.getElementById(
    "btn-load-more",
  ) as HTMLButtonElement | null;

  if (state.loading && state.media.length === 0) {
    const skels = Array(8)
      .fill(0)
      .map(
        (_, i) =>
          `<div class="card skeleton" style="animation-delay:${i * 50}ms; min-height: 220px;"></div>`,
      )
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
    document
      .getElementById("btn-add-empty")
      ?.addEventListener("click", () => openModal());
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  container.innerHTML = filteredMedia
    .map((m) => {
      const pct = m.progress_total
        ? Math.min(
            100,
            Math.round((m.progress_current / m.progress_total) * 100),
          )
        : 0;
      const unit = progressLabel(m.media_type);
      const totalStr = m.progress_total ? m.progress_total : "?";
      const isStale =
        m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
      const staleClass = isStale ? " card-stale" : "";
      const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
      const isSelected = selectedSet.has(m._id);

      // ── Cover image
      let coverUrl = "";
      if (m.custom_cover_url) {
        coverUrl = m.custom_cover_url;
      } else if (m.media_type === "Manhwa" && m.mangadex_id) {
        coverUrl = `/api/cover?mangadex_id=${encodeURIComponent(m.mangadex_id)}`;
      } else {
        const cachedCover = getCachedCover(m.title);
        if (cachedCover && isAnime) {
          coverUrl = cachedCover;
        } else if (isAnime) {
          queueCoverFetch(m.title, m._id);
        }
      }

      const thumbStyle = coverUrl ? `background-image:url('${coverUrl}')` : "";
      const thumbClass = coverUrl ? "card-thumb thumb-loaded" : "card-thumb";

      // ── Rating stars display
      const ratingHtml = m.rating
        ? `<div class="card-rating">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>${m.rating}<span class="card-rating-max">/10</span></span>
          </div>`
        : "";

      // ── Progress bar color via status
      const progressColorMap: Record<string, string> = {
        "Watching/Reading": "var(--cyan)",
        Completed: "var(--green)",
        Planned: "var(--violet)",
        "On Hold": "var(--amber)",
        Dropped: "var(--red)",
      };
      const progressColor =
        progressColorMap[m.status] ?? "var(--text-secondary)";

      return `
      <div class="card${staleClass}${isSelected ? " card-selected" : ""}" 
           data-status="${escapeHtml(m.status)}" 
           data-id="${m._id}">

        ${
          state.bulkMode
            ? `
          <label class="card-bulk-overlay" aria-label="Select ${escapeHtml(m.title)}">
            <input type="checkbox" class="bulk-select" data-id="${m._id}" ${isSelected ? "checked" : ""}>
            <span class="card-bulk-check${isSelected ? " checked" : ""}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </label>
        `
            : ""
        }

        <!-- Poster strip -->
        <div class="card-poster">
          <div class="${thumbClass}" data-cover-id="${m._id}" style="${thumbStyle}"></div>
          <div class="card-poster-info">
            <div class="card-badges">
              <span class="badge badge-type">${escapeHtml(m.media_type)}</span>
              <span class="badge" data-status="${escapeHtml(m.status)}">${escapeHtml(m.status)}</span>
              ${isStale ? `<span class="badge badge-stale" title="Not updated in ${daysSince(m.last_updated)} days">⏱ Stale</span>` : ""}
            </div>
            <h3 class="card-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h3>
            <span class="card-updated-time">${relativeTime(m.last_updated)}</span>
          </div>
        </div>

        <!-- Progress -->
        <div class="card-body">
          <div class="card-progress-header">
            <span class="card-progress-text">
              <strong>${m.progress_current}</strong>
              <span class="card-progress-sep">/ ${totalStr}</span>
              <span class="card-progress-unit">${unit}</span>
            </span>
            <div class="card-body-right">
              ${ratingHtml}
              <button class="btn-increment" data-id="${m._id}" title="Increment progress" aria-label="Add 1 ${unit}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                +1
              </button>
            </div>
          </div>

          <div class="card-progress-track">
            <div class="card-progress-fill" style="width:${pct}%; background:${progressColor}"></div>
          </div>

          <div class="card-progress-footer">
            <span class="card-pct-label">${m.progress_total ? `${pct}%` : "?"}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button class="card-action-btn btn-edit" data-id="${m._id}" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button class="card-action-btn card-action-danger btn-delete" data-id="${m._id}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  if (loadMoreBtn) {
    loadMoreBtn.style.display = state.hasMore ? "inline-flex" : "none";
    loadMoreBtn.disabled = state.loadingMore;
    loadMoreBtn.innerHTML = state.loadingMore
      ? `<span class="spinner"></span>`
      : "Load more";
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
