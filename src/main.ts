/**
 * Chronicle — Personal Media Tracker
 * Clean bootstrap using the new reactive system (Phase 3)
 */
import "./style.css";
import { loadCoverCache, store } from "./state/store.js";
import { mountApp } from "./ui/root.js";
import { setupCardEventDelegation } from "./features/media/cards.js";
import { setupMediaFormHandler } from "./features/media/modal.js";
import { setupImportHandler } from "./features/import-export/index.js";
import { setupSettingsGlobalHandlers } from "./features/settings.js";

// ── One-time setup (event delegation only) ─────────────────────────────
setupCardEventDelegation();
setupMediaFormHandler();
setupImportHandler();
setupSettingsGlobalHandlers();

// ── App initialization ─────────────────────────────────────────────────
async function init() {
  loadCoverCache();
  mountApp(); // ← selective rendering starts here

  // Initial data load if already logged in
  if (store.get().token) {
    const { fetchMedia } = await import("./services/media.js");
    try {
      await fetchMedia();
    } catch (err) {
      console.error("Initial fetchMedia failed:", err);
    }
  }
}

init();
