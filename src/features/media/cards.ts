/** Media card grid rendering. */

import type { MediaItem } from "../../types/media.js";
import { state, getCachedCover, queueCoverFetch } from "../../state/store.js";
import {
  relativeTime,
  daysSince,
  progressLabel,
  escapeHtml,
} from "../../utils/format.js";
import { openModal } from "./modal.js";
import { fetchMedia } from "../../api/media.js";
import { apiFetch } from "../../api/client.js";
import { showToast } from "../../ui/toast.js";
import { showConfirm } from "../../ui/modals.js";
import { renderStatsHost } from "./stats.js";

export function renderMediaCards(): void {
  const container = document.getElementById("media-grid");
  if (!container) return;
  const loadMoreBtn = document.getElementById(
    "btn-load-more",
  ) as HTMLButtonElement | null;

  if (state.loading && state.media.length === 0) {
    const skels = Array(8)
      .fill(0)
      .map(
        (_, i) => `
      <div class="card skeleton" style="animation-delay:${i * 50}ms; min-height: 180px;"></div>
    `,
      )
      .join("");
    container.innerHTML = skels;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  const selectedSet = state.selectedIds;

  if (state.media.length === 0) {
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

  container.innerHTML = state.media
    .map((m) => {
      const pct = m.progress_total
        ? Math.min(
            100,
            Math.round((m.progress_current / m.progress_total) * 100),
          )
        : 0;
      const unit = progressLabel(m.media_type);
      const ratingStr = m.rating
        ? `<span class="card-rating"><span class="star">★</span>${m.rating}/10</span>`
        : "";
      const totalStr = m.progress_total ? m.progress_total : "?";

      const isStale =
        m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
      const staleClass = isStale ? " card-stale" : "";
      const staleBadge = isStale
        ? `<span class="badge badge-stale" title="Not updated in ${daysSince(m.last_updated)} days">⏱ STALE</span>`
        : "";

      const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
      const cachedCover = getCachedCover(m.title);
      let thumbHtml = "";
      
      if (cachedCover && isAnime) {
        thumbHtml = `<div class="card-thumb thumb-loaded" data-cover-id="${m._id}" style="background-image:url(${cachedCover})"></div>`;
      } else {
        // Render fallback empty thumb for non-anime or missing covers
        thumbHtml = `<div class="card-thumb" data-cover-id="${m._id}"></div>`;
        if (isAnime) {
          queueCoverFetch(m.title, m._id);
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
            <h3>${escapeHtml(m.title)}</h3>
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
          <button class="btn-ghost btn-edit" data-id="${m._id}">Edit</button>
          <button class="btn-danger btn-delete" data-id="${m._id}">Delete</button>
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
      state.page += 1;
      await fetchMedia(false);
      renderStatsHost();
      renderMediaCards();
    };
  }
}

/** Set up global event delegation for card buttons. */
export function setupCardEventDelegation(): void {
  // Bulk checkbox changes
  document.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("bulk-select")) return;
    const checkbox = target as HTMLInputElement;
    const id = checkbox.getAttribute("data-id");
    if (!id) return;
    if (checkbox.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    const countEl = document.querySelector(".bulk-count");
    if (countEl) countEl.textContent = `${state.selectedIds.size} selected`;
  });

  // Card action buttons
  document.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const id = target.getAttribute("data-id");
    if (!id) return;

    if (target.classList.contains("btn-edit")) {
      const item = state.media.find((m) => m._id === id);
      if (item) openModal(item);
    } else if (target.classList.contains("btn-delete")) {
      const item = state.media.find((m) => m._id === id);
      const title = item ? item.title : "this entry";
      showConfirm(
        "Delete entry?",
        `"${title}" will be permanently removed.`,
        async () => {
          try {
            await apiFetch(`/media?id=${id}`, { method: "DELETE" });
            showToast("Entry deleted", "success");
            await fetchMedia(true, true);
            renderStatsHost();
            renderMediaCards();
          } catch {
            showToast("Failed to delete. Please try again.", "error");
          }
        },
      );
    } else if (target.classList.contains("btn-increment")) {
      const item = state.media.find((m) => m._id === id);
      if (item) {
        // Optimistic UI update
        item.progress_current += 1;
        renderMediaCards();
        try {
          await apiFetch(`/media?id=${id}`, {
            method: "PUT",
            body: JSON.stringify({ progress_current: item.progress_current }),
          });
          await fetchMedia(true, true);
          renderStatsHost();
          renderMediaCards();
        } catch {
          // Revert on failure
          item.progress_current -= 1;
          renderMediaCards();
          showToast("Failed to update progress.", "error");
        }
      }
    }
  });
}
