import { store } from "../../state/store.js";
import { escapeHtml } from "../../utils/format.js";
import {
  setSearchTerm,
  setFilterSort,
  toggleBulkMode,
} from "../../features/dashboard.js";
import { openModal } from "../../features/media/modal.js";

let searchTimer: ReturnType<typeof setTimeout> | null = null;
const SEARCH_DEBOUNCE_MS = 250;

export function renderControls(): void {
  const container = document.getElementById("controls-host");
  if (!container) return;

  const state = store.get();

  const existingSearch = container.querySelector("#search") as HTMLInputElement;
  if (existingSearch && document.activeElement === existingSearch) {
    const filterType = container.querySelector(
      "#filter-type",
    ) as HTMLSelectElement;
    const filterStatus = container.querySelector(
      "#filter-status",
    ) as HTMLSelectElement;
    const sortBy = container.querySelector("#sort-by") as HTMLSelectElement;
    if (filterType) filterType.value = state.filterType;
    if (filterStatus) filterStatus.value = state.filterStatus;
    if (sortBy) sortBy.value = state.sortBy;
    return;
  }

  const chips: string[] = [];
  if (state.filterType) {
    chips.push(
      `<span class="filter-chip">Type: ${escapeHtml(state.filterType)} <button aria-label="Clear type filter" data-clear="filterType">✕</button></span>`,
    );
  }
  if (state.filterStatus) {
    chips.push(
      `<span class="filter-chip">Status: ${escapeHtml(state.filterStatus)} <button aria-label="Clear status filter" data-clear="filterStatus">✕</button></span>`,
    );
  }

  const activeFiltersHtml =
    chips.length > 0
      ? `
    <div class="active-filters-row">
      ${chips.join("")}
      <button class="btn-ghost" id="btn-clear-all" style="padding: 4px 8px; font-size: 0.8rem;">Clear All</button>
    </div>
  `
      : "";

  container.innerHTML = `
    <div class="controls">
      ${activeFiltersHtml}
      <div class="controls-toolbar">
        <div class="search-wrapper">
          <span class="search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input type="text" id="search" placeholder="Search titles..." value="${escapeHtml(state.search)}">
        </div>
        <div class="controls-filters">
          <select id="filter-type" aria-label="Filter by type">
            <option value="">All Types</option>
            <option value="Anime" ${state.filterType === "Anime" ? "selected" : ""}>Anime</option>
            <option value="Manhwa" ${state.filterType === "Manhwa" ? "selected" : ""}>Manhwa</option>
            <option value="Donghua" ${state.filterType === "Donghua" ? "selected" : ""}>Donghua</option>
            <option value="Light Novel" ${state.filterType === "Light Novel" ? "selected" : ""}>Light Novel</option>
          </select>
          <select id="filter-status" aria-label="Filter by status">
            <option value="">All Statuses</option>
            <option value="Watching/Reading" ${state.filterStatus === "Watching/Reading" ? "selected" : ""}>Watching/Reading</option>
            <option value="Planned" ${state.filterStatus === "Planned" ? "selected" : ""}>Planned</option>
            <option value="On Hold" ${state.filterStatus === "On Hold" ? "selected" : ""}>On Hold</option>
            <option value="Dropped" ${state.filterStatus === "Dropped" ? "selected" : ""}>Dropped</option>
            <option value="Completed" ${state.filterStatus === "Completed" ? "selected" : ""}>Completed</option>
          </select>
          <select id="sort-by" aria-label="Sort order">
            <option value="last_updated" ${state.sortBy === "last_updated" ? "selected" : ""}>Recently Updated</option>
            <option value="progress" ${state.sortBy === "progress" ? "selected" : ""}>Progress %</option>
            <option value="rating" ${state.sortBy === "rating" ? "selected" : ""}>Rating</option>
            <option value="title" ${state.sortBy === "title" ? "selected" : ""}>Title A–Z</option>
          </select>
        </div>
        <div class="controls-actions">
          <button id="btn-bulk-mode" class="btn-ghost controls-btn-bulk" title="Bulk actions">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="4" height="4" rx="1"/><rect x="3" y="11" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/>
              <line x1="10" y1="7" x2="21" y2="7"/><line x1="10" y1="13" x2="21" y2="13"/><line x1="10" y1="19" x2="21" y2="19"/>
            </svg>
            ${state.bulkMode ? "Done" : "Bulk"}
          </button>
          <button class="btn-primary controls-btn-add" id="btn-add">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Entry
          </button>
        </div>
      </div>
    </div>
  `;

  document
    .getElementById("btn-bulk-mode")
    ?.addEventListener("click", () => toggleBulkMode());
  document
    .getElementById("btn-add")
    ?.addEventListener("click", () => openModal());

  document.getElementById("search")?.addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setSearchTerm(value);
      searchTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  });

  ["filter-type", "filter-status", "sort-by"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      const key =
        id === "filter-type"
          ? "filterType"
          : id === "filter-status"
            ? "filterStatus"
            : "sortBy";
      setFilterSort(key, target.value);
    });
  });

  container.querySelectorAll("[data-clear]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const type = (e.currentTarget as HTMLButtonElement).getAttribute(
        "data-clear",
      );
      if (type === "search") setSearchTerm("");
      else if (type === "filterType" || type === "filterStatus" || type === "sortBy")
        setFilterSort(type, "");
    });
  });

  document.getElementById("btn-clear-all")?.addEventListener("click", () => {
    setSearchTerm("");
    setFilterSort("filterType", "");
    setFilterSort("filterStatus", "");
  });
}
