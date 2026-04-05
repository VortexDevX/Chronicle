/**
 * Chronicle — Personal Media Tracker
 * Thin bootstrap: imports modules and initializes the app.
 */

import "./style.css";

import { state, loadCoverCache } from "./state/store.js";
import { renderApp } from "./ui/renderApp.js";
import { fetchMedia } from "./api/media.js";
import { setupCardEventDelegation } from "./features/media/cards.js";
import { setupMediaFormHandler } from "./features/media/modal.js";
import { setupImportHandler } from "./features/import-export/index.js";
import { renderStatsHost } from "./features/media/stats.js";
import { renderMediaCards } from "./features/media/cards.js";
import { setupSettingsGlobalHandlers } from "./features/settings.js";

// ── One-time setup ─────────────────────────────────────────────────

setupCardEventDelegation();
setupMediaFormHandler();
setupImportHandler();
setupSettingsGlobalHandlers();

// ── App initialization ─────────────────────────────────────────────

async function init() {
  loadCoverCache();
  renderApp();

  if (state.token) {
    try {
      const request = fetchMedia();
      renderStatsHost();
      renderMediaCards();
      await request;
    } catch {
      // Handled by apiFetch -> logout() on 401
    }
  }

  renderApp();
  if (state.token) {
    renderStatsHost();
    renderMediaCards();
  }
}

init();
