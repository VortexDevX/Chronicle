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
import type { MediaItem } from "../../types/media.js";

const cardRenderHashById = new Map<string, string>();

function toElement(html: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

function getCoverUrl(m: MediaItem): string {
  if (m.custom_cover_url) return m.custom_cover_url;
  if (m.media_type === "Manhwa" && m.mangadex_id) {
    return `/api/cover?mangadex_id=${encodeURIComponent(m.mangadex_id)}`;
  }
  const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
  if (!isAnime) return "";

  const cachedCover = getCachedCover(m.title);
  if (cachedCover) return cachedCover;
  queueCoverFetch(m.title, m._id);
  return "";
}

function renderCard(
  m: MediaItem,
  selectedSet: ReadonlySet<string>,
  bulkMode: boolean,
  pendingActionIds: ReadonlySet<string>,
): string {
  const pct = m.progress_total
    ? Math.min(100, Math.round((m.progress_current / m.progress_total) * 100))
    : 0;
  const unit = progressLabel(m.media_type);
  const totalStr = m.progress_total ? m.progress_total : "?";
  const isStale =
    m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
  const staleClass = isStale ? " card-stale" : "";
  const isSelected = selectedSet.has(m._id);
  const isIncrementing = pendingActionIds.has(`${m._id}:increment`);
  const isDeleting = pendingActionIds.has(`${m._id}:delete`);
  const hasPendingAction = isIncrementing || isDeleting;
  const coverUrl = getCoverUrl(m);
  const thumbStyle = coverUrl ? `background-image:url('${coverUrl}')` : "";
  const thumbClass = coverUrl ? "card-thumb thumb-loaded" : "card-thumb";
  const ratingHtml = m.rating
    ? `<div class="card-rating">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>${m.rating}<span class="card-rating-max">/10</span></span>
          </div>`
    : "";

  const progressColorMap: Record<string, string> = {
    "Watching/Reading": "var(--cyan)",
    Completed: "var(--green)",
    Planned: "var(--violet)",
    "On Hold": "var(--amber)",
    Dropped: "var(--red)",
  };
  const progressColor = progressColorMap[m.status] ?? "var(--text-secondary)";

  return `
      <div class="card${staleClass}${isSelected ? " card-selected" : ""}" 
           data-status="${escapeHtml(m.status)}" 
           data-id="${m._id}">
        ${
          bulkMode
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
        <div class="card-body">
          <div class="card-progress-header">
            <span class="card-progress-text">
              <strong>${m.progress_current}</strong>
              <span class="card-progress-sep">/ ${totalStr}</span>
              <span class="card-progress-unit">${unit}</span>
            </span>
            <div class="card-body-right">
              ${ratingHtml}
            </div>
          </div>
          <div class="card-progress-track">
            <div class="card-progress-fill" style="width:${pct}%; background:${progressColor}"></div>
          </div>
          <div class="card-progress-footer">
            <span class="card-pct-label">${m.progress_total ? `${pct}%` : "?"}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="card-action-btn btn-edit" data-id="${m._id}" title="Edit" ${hasPendingAction ? "disabled" : ""}>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button class="card-action-btn btn-increment" data-id="${m._id}" title="Increment progress" aria-label="Add 1 ${unit}" ${hasPendingAction ? "disabled" : ""}>
            ${
              isIncrementing
                ? `<span class="spinner"></span> Updating...`
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  +1`
            }
          </button>
          <button class="card-action-btn card-action-danger btn-delete" data-id="${m._id}" title="Delete" ${hasPendingAction ? "disabled" : ""}>
            ${
              isDeleting
                ? `<span class="spinner"></span> Deleting...`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                  Delete`
            }
          </button>
        </div>
      </div>
    `;
}

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
          `<div class="card skeleton-card" style="animation-delay:${i * 50}ms;">
            <div class="card-poster">
              <div class="card-thumb skeleton"></div>
              <div class="card-poster-info">
                <div class="skeleton skeleton-line skeleton-line-sm"></div>
                <div class="skeleton skeleton-line skeleton-line-lg"></div>
                <div class="skeleton skeleton-line skeleton-line-xs"></div>
              </div>
            </div>
            <div class="card-body">
              <div class="skeleton skeleton-line skeleton-line-md"></div>
              <div class="skeleton skeleton-progress"></div>
            </div>
            <div class="card-actions">
              <div class="skeleton skeleton-button"></div>
              <div class="skeleton skeleton-button"></div>
              <div class="skeleton skeleton-button"></div>
            </div>
          </div>`,
      )
      .join("");
    container.innerHTML = skels;
    cardRenderHashById.clear();
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  const selectedSet = state.selectedIds;
  const pendingActionIds = state.pendingActionIds;

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
    cardRenderHashById.clear();
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  if (container.querySelector(".skeleton, .empty-state")) {
    container.innerHTML = "";
  }

  const existingCards = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>(".card[data-id]").forEach((node) => {
    const id = node.getAttribute("data-id");
    if (id) existingCards.set(id, node);
  });
  const nextIds = new Set<string>();

  for (const m of filteredMedia) {
    const cardMarkup = renderCard(m, selectedSet, state.bulkMode, pendingActionIds);
    const nextHash = [
      m.title,
      m.media_type,
      m.progress_current,
      m.progress_total,
      m.status,
      m.rating ?? "",
      m.custom_cover_url ?? "",
      m.mangadex_id ?? "",
      m.last_updated,
      state.bulkMode ? "1" : "0",
      selectedSet.has(m._id) ? "1" : "0",
      pendingActionIds.has(`${m._id}:increment`) ? "inc" : "",
      pendingActionIds.has(`${m._id}:delete`) ? "del" : "",
    ].join("|");
    const prevHash = cardRenderHashById.get(m._id);

    let node = existingCards.get(m._id);
    if (!node) {
      node = toElement(cardMarkup);
    } else if (prevHash !== nextHash) {
      const nextNode = toElement(cardMarkup);
      node.replaceWith(nextNode);
      node = nextNode;
    }

    container.appendChild(node);
    cardRenderHashById.set(m._id, nextHash);
    nextIds.add(m._id);
  }

  for (const [id, node] of existingCards.entries()) {
    if (nextIds.has(id)) continue;
    node.remove();
    cardRenderHashById.delete(id);
  }

  if (loadMoreBtn) {
    loadMoreBtn.style.display = state.hasMore ? "inline-flex" : "none";
    loadMoreBtn.disabled = state.loadingMore;
    loadMoreBtn.innerHTML = state.loadingMore
      ? `<span class="spinner"></span> Loading more...`
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
