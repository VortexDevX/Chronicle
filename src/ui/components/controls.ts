import { store } from "../../state/store.js";
import { escapeHtml } from "../../utils/format.js";
import { setSearchTerm, setFilterSort, toggleBulkMode } from "../../features/dashboard.js";
import { openModal } from "../../features/media/modal.js";


export function renderControls(): void {
  const container = document.getElementById("controls-host");
  if (!container) return;

  const state = store.get();

  // If search input already exists and has focus, don't re-render (prevents losing focus mid-type)
  const existingSearch = container.querySelector("#search") as HTMLInputElement;
  if (existingSearch && document.activeElement === existingSearch) {
    // Just update dropdowns without destroying the search input
    const filterType = container.querySelector("#filter-type") as HTMLSelectElement;
    const filterStatus = container.querySelector("#filter-status") as HTMLSelectElement;
    const sortBy = container.querySelector("#sort-by") as HTMLSelectElement;
    if (filterType) filterType.value = state.filterType;
    if (filterStatus) filterStatus.value = state.filterStatus;
    if (sortBy) sortBy.value = state.sortBy;
    return;
  }

  const chips: string[] = [];
  if (state.filterType) {
    chips.push(`<span class="filter-chip">Type: ${escapeHtml(state.filterType)} <button aria-label="Clear type filter" data-clear="filterType">✕</button></span>`);
  }
  if (state.filterStatus) {
    chips.push(`<span class="filter-chip">Status: ${escapeHtml(state.filterStatus)} <button aria-label="Clear status filter" data-clear="filterStatus">✕</button></span>`);
  }

  const activeFiltersHtml = chips.length > 0 ? `
    <div class="active-filters" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
      ${chips.join("")}
      <button class="btn-ghost btn-sm" id="btn-clear-all" style="padding: 4px 8px; font-size: 0.8rem;">Clear All</button>
    </div>
  ` : "";

  container.innerHTML = `
    <div class="controls">
      ${activeFiltersHtml}
      <div class="search-wrapper">
        <input type="text" id="search" placeholder="Search titles..." value="${escapeHtml(state.search)}">
      </div>
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
      <button id="btn-bulk-mode" class="btn-ghost" title="Bulk actions">${state.bulkMode ? "Done" : "Bulk"}</button>
      <button class="btn-primary" id="btn-add">+ Add Entry</button>
    </div>
  `;

  document.getElementById("btn-bulk-mode")?.addEventListener("click", () => toggleBulkMode());
  document.getElementById("btn-add")?.addEventListener("click", () => openModal());

  // Live Search (instant)
  document.getElementById("search")?.addEventListener("input", (e) => {
    setSearchTerm((e.target as HTMLInputElement).value);
  });

  // Filters & Sort
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

  // Clear Handlers
  container.querySelectorAll("[data-clear]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const type = (e.currentTarget as HTMLButtonElement).getAttribute("data-clear");
      if (type === "search") setSearchTerm("");
      else if (type) setFilterSort(type as any, "");
    });
  });

  document.getElementById("btn-clear-all")?.addEventListener("click", () => {
    setSearchTerm("");
    setFilterSort("filterType", "");
    setFilterSort("filterStatus", "");
  });
}
