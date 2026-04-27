import { store } from "../../state/store.js";
import {
  selectAllLoaded,
  clearSelection,
  submitBulkStatus,
  submitBulkIncrement,
  submitBulkDelete,
} from "../../features/dashboard.js";
import { showConfirm } from "../modals.js";

export function renderBulkBar(): void {
  const container = document.getElementById("bulk-bar-host");
  if (!container) return;

  const state = store.get();
  if (!state.bulkMode) {
    container.innerHTML = "";
    return;
  }
  const isBusy = Boolean(state.bulkAction);
  const statusLabel =
    state.bulkAction === "status" ? `<span class="spinner"></span> Applying...` : "Apply Status";
  const incrementLabel =
    state.bulkAction === "increment" ? `<span class="spinner"></span> Updating...` : "+1 Progress";
  const deleteLabel =
    state.bulkAction === "delete" ? `<span class="spinner"></span> Deleting...` : "Delete Selected";

  container.innerHTML = `
    <div class="bulk-bar">
      <span class="bulk-count">${state.selectedIds.size} selected</span>
      <button id="btn-bulk-select-all" class="btn-ghost" ${isBusy ? "disabled" : ""}>Select loaded</button>
      <button id="btn-bulk-clear" class="btn-ghost" ${isBusy ? "disabled" : ""}>Clear</button>
      <select id="bulk-status" aria-label="Bulk status" ${isBusy ? "disabled" : ""}>
        <option value="Watching/Reading">Watching/Reading</option>
        <option value="Planned">Planned</option>
        <option value="On Hold">On Hold</option>
        <option value="Dropped">Dropped</option>
        <option value="Completed">Completed</option>
      </select>
      <button id="btn-bulk-status" class="btn-ghost" ${isBusy ? "disabled" : ""}>${statusLabel}</button>
      <button id="btn-bulk-increment" class="btn-ghost" ${isBusy ? "disabled" : ""}>${incrementLabel}</button>
      <button id="btn-bulk-delete" class="btn-danger" ${isBusy ? "disabled" : ""}>${deleteLabel}</button>
    </div>
  `;

  document.getElementById("btn-bulk-select-all")?.addEventListener("click", selectAllLoaded);
  document.getElementById("btn-bulk-clear")?.addEventListener("click", clearSelection);
  document.getElementById("btn-bulk-status")?.addEventListener("click", async () => {
    const status = (document.getElementById("bulk-status") as HTMLSelectElement).value;
    await submitBulkStatus(status);
  });
  document.getElementById("btn-bulk-increment")?.addEventListener("click", submitBulkIncrement);
  document.getElementById("btn-bulk-delete")?.addEventListener("click", () => {
    const ids = Array.from(store.get().selectedIds);
    showConfirm(
      "Delete selected entries?",
      `${ids.length} entries will be permanently removed.`,
      () => { submitBulkDelete(); }
    );
  });
}
