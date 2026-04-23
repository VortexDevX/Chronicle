/** Central render pipeline – selective rendering with selectors (Phase 3) */
import { store } from "../state/store.js";
import { renderApp } from "./renderApp.js";
import { renderMediaCards } from "./components/mediaCards.js";
import { renderStatsHost } from "./components/stats.js";
import { renderBulkBar } from "./components/bulkBar.js";
import { renderControls } from "./components/controls.js";

/** Mount the app with selective subscriptions */
export function mountApp(): void {
  // Initial full shell render
  renderApp();

  // Re-render the entire shell when auth state changes (login/logout)
  store.subscribe(
    (state) => state.token,
    () => renderApp(),
  );

  // Stats — only re-render when globalStats changes (handled in stats.ts)
  // Removed redundant media→statsHost subscription

  // Selective updates — only re-render what changed
  store.subscribe(
    (state) => ({
      bulkMode: state.bulkMode,
      selectedIds: Array.from(state.selectedIds),
    }),
    () => renderBulkBar(),
  );

  store.subscribe(
    (state) => ({
      filterType: state.filterType,
      filterStatus: state.filterStatus,
      sortBy: state.sortBy,
      bulkMode: state.bulkMode,
    }),
    () => renderControls(),
  );

  store.subscribe(
    (state) => ({
      mediaRev: state.mediaRev,
      search: state.search,
      filterType: state.filterType,
      filterStatus: state.filterStatus,
      sortBy: state.sortBy,
      bulkMode: state.bulkMode,
      selectedIds: Array.from(state.selectedIds),
      loading: state.loading,
      loadingMore: state.loadingMore,
      hasMore: state.hasMore,
    }),
    () => renderMediaCards(),
  );
}
