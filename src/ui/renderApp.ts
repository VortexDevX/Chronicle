/** Main application render — orchestrates the entire UI. */

import { state } from "../state/store.js";
import { escapeHtml } from "../utils/format.js";
import { renderStats, renderStatsHost } from "../features/media/stats.js";
import { renderMediaCards } from "../features/media/cards.js";
import { openModal } from "../features/media/modal.js";
import { fetchMedia } from "../api/media.js";
import { logout } from "../api/auth.js";
import { showToast } from "./toast.js";
import { showConfirm } from "./modals.js";
import { apiFetch } from "../api/client.js";
import {
  exportJSON,
  exportCSV,
  openExportTypeDialog,
  triggerImport,
} from "../features/import-export/index.js";

export function renderApp(): void {
  const app = document.getElementById("app")!;

  if (!state.token) {
    renderAuthScreen(app);
    return;
  }

  renderDashboard(app);
}

function renderAuthScreen(app: HTMLElement): void {
  app.innerHTML = `
    <div class="auth-container">
      <h1>Chronicle</h1>
      <p class="auth-subtitle">Track your anime, manhwa, donghua & light novels</p>
      <form id="auth-form">
        <div class="auth-form-group">
          <label for="auth-user">Username</label>
          <input type="text" id="auth-user" placeholder="Enter username" required autocomplete="username">
        </div>
        <div class="auth-form-group">
          <label for="auth-pass">Password</label>
          <input type="password" id="auth-pass" placeholder="Enter password" required autocomplete="current-password">
        </div>
        <div id="auth-error" class="auth-error"></div>
        <div class="auth-actions">
          <button type="submit" class="btn-primary" data-action="login">Login</button>
          <button type="submit" data-action="register">Register</button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById("auth-form")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const clickedBtn =
      (e.submitter as HTMLButtonElement) ||
      form.querySelector("[data-action='login']");
    const action = clickedBtn?.getAttribute("data-action") || "login";
    const username = (
      document.getElementById("auth-user") as HTMLInputElement
    ).value;
    const password = (
      document.getElementById("auth-pass") as HTMLInputElement
    ).value;
    const errorEl = document.getElementById("auth-error")!;

    const buttons = form.querySelectorAll("button");
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.getAttribute("data-action") === action) {
        b.innerHTML = `<span class="spinner"></span>`;
      }
    });
    errorEl.textContent = "";

    try {
      const { login: doLogin, register: doRegister } = await import(
        "../api/auth.js"
      );
      const res =
        action === "register"
          ? await doRegister(username, password)
          : await doLogin(username, password);
      state.token = res.token;
      state.username = res.username;
      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);

      // Fetch media and render dashboard
      try {
        await fetchMedia();
      } catch {
        // handled
      }
      renderApp();
    } catch (err: any) {
      const serverMsg = err?.message || "";
      errorEl.textContent =
        serverMsg ||
        (action === "register"
          ? "Registration failed. Username may be taken."
          : "Login failed. Check your credentials.");
      buttons.forEach((b) => {
        b.disabled = false;
        const act = b.getAttribute("data-action");
        if (act === "login") b.textContent = "Login";
        else if (act === "register") b.textContent = "Register";
      });
    }
  });

  setTimeout(() => {
    (document.getElementById("auth-user") as HTMLInputElement)?.focus();
  }, 50);
}

function renderDashboard(app: HTMLElement): void {
  app.innerHTML = `
    <div class="container">
      <header>
        <h2>Chronicle</h2>
        <div class="header-right">
          <button id="btn-import" class="btn-ghost" title="Import JSON/CSV/Excel">↑ Import</button>
          <div class="export-menu-wrap">
            <button id="btn-export" class="btn-ghost" title="Export data">↓ Export</button>
            <div class="export-menu" id="export-menu">
              <button id="btn-export-json" class="btn-ghost">Export JSON</button>
              <button id="btn-export-csv" class="btn-ghost">Export CSV</button>
              <button id="btn-export-by-type" class="btn-ghost">Export by Type</button>
            </div>
          </div>
          <span class="header-user">${escapeHtml(state.username)}</span>
          <button id="btn-logout" class="btn-ghost">Logout</button>
        </div>
      </header>
      <div id="stats-host">${renderStats()}</div>
      <div class="controls">
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
      ${
        state.bulkMode
          ? `<div class="bulk-bar">
              <span class="bulk-count">${state.selectedIds.size} selected</span>
              <button id="btn-bulk-select-all" class="btn-ghost">Select loaded</button>
              <button id="btn-bulk-clear" class="btn-ghost">Clear</button>
              <select id="bulk-status" aria-label="Bulk status">
                <option value="Watching/Reading">Watching/Reading</option>
                <option value="Planned">Planned</option>
                <option value="On Hold">On Hold</option>
                <option value="Dropped">Dropped</option>
                <option value="Completed">Completed</option>
              </select>
              <button id="btn-bulk-status" class="btn-ghost">Apply Status</button>
              <button id="btn-bulk-increment" class="btn-ghost">+1 Progress</button>
              <button id="btn-bulk-delete" class="btn-danger">Delete Selected</button>
            </div>`
          : ""
      }
      <div id="media-grid" class="grid"></div>
      <div class="load-more-wrap">
        <button id="btn-load-more" class="btn-ghost">Load more</button>
      </div>
      <button id="btn-add-fab" class="btn-fab" aria-label="Add Entry">＋</button>
    </div>
  `;

  // ── Wire up event handlers ───────────────────────────────────

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    logout();
    renderApp();
  });
  document
    .getElementById("btn-add")
    ?.addEventListener("click", () => openModal());
  document
    .getElementById("btn-add-fab")
    ?.addEventListener("click", () => openModal());
  document.getElementById("btn-bulk-mode")?.addEventListener("click", () => {
    state.bulkMode = !state.bulkMode;
    if (!state.bulkMode) state.selectedIds.clear();
    renderApp();
  });

  // Export menu
  document.getElementById("btn-export")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("export-menu")?.classList.toggle("open");
  });
  document.getElementById("btn-export-json")?.addEventListener("click", () => {
    document.getElementById("export-menu")?.classList.remove("open");
    exportJSON();
  });
  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    document.getElementById("export-menu")?.classList.remove("open");
    exportCSV();
  });
  document
    .getElementById("btn-export-by-type")
    ?.addEventListener("click", () => {
      document.getElementById("export-menu")?.classList.remove("open");
      openExportTypeDialog();
    });
  document.addEventListener(
    "click",
    () => {
      document.getElementById("export-menu")?.classList.remove("open");
    },
    { once: true },
  );

  // Import
  document
    .getElementById("btn-import")
    ?.addEventListener("click", triggerImport);

  // Search with debounce
  let searchTimeout: ReturnType<typeof setTimeout>;
  document.getElementById("search")?.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      state.search = (e.target as HTMLInputElement).value;
      await fetchMedia(true);
      renderStatsHost();
      renderMediaCards();
    }, 150);
  });

  // Filter & sort
  ["filter-type", "filter-status", "sort-by"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async (e) => {
      const target = e.target as HTMLSelectElement;
      const key =
        id === "filter-type"
          ? "filterType"
          : id === "filter-status"
            ? "filterStatus"
            : "sortBy";
      (state as any)[key] = target.value;
      await fetchMedia(true);
      renderStatsHost();
      renderMediaCards();
    });
  });

  renderMediaCards();

  // ── Bulk action handlers ──────────────────────────────────────

  if (state.bulkMode) {
    document
      .getElementById("btn-bulk-select-all")
      ?.addEventListener("click", () => {
        state.media.forEach((m) => state.selectedIds.add(m._id));
        renderApp();
      });
    document.getElementById("btn-bulk-clear")?.addEventListener("click", () => {
      state.selectedIds.clear();
      renderApp();
    });
    document
      .getElementById("btn-bulk-status")
      ?.addEventListener("click", async () => {
        const status = (
          document.getElementById("bulk-status") as HTMLSelectElement
        ).value;
        const ids = Array.from(state.selectedIds);
        if (ids.length === 0) return showToast("No entries selected.", "error");

        const updates = await Promise.allSettled(
          ids.map((id) =>
            apiFetch(`/media?id=${id}`, {
              method: "PUT",
              body: JSON.stringify({ status }),
            }),
          ),
        );
        const ok = updates.filter((r) => r.status === "fulfilled").length;
        const fail = updates.length - ok;
        showToast(
          `Updated ${ok} entries${fail ? `, ${fail} failed` : ""}`,
          ok > 0 ? "success" : "error",
        );
        state.selectedIds.clear();
        state.bulkMode = false;
        await fetchMedia(true, true);
        renderApp();
      });
    document
      .getElementById("btn-bulk-increment")
      ?.addEventListener("click", async () => {
        const ids = Array.from(state.selectedIds);
        if (ids.length === 0) return showToast("No entries selected.", "error");

        const updates = await Promise.allSettled(
          ids.map((id) => {
            const item = state.media.find((m) => m._id === id);
            if (!item) return Promise.resolve(null);
            return apiFetch(`/media?id=${id}`, {
              method: "PUT",
              body: JSON.stringify({
                progress_current: item.progress_current + 1,
              }),
            });
          }),
        );
        const ok = updates.filter((r) => r.status === "fulfilled").length;
        const fail = updates.length - ok;
        showToast(
          `Incremented ${ok} entries${fail ? `, ${fail} failed` : ""}`,
          ok > 0 ? "success" : "error",
        );
        state.selectedIds.clear();
        state.bulkMode = false;
        await fetchMedia(true, true);
        renderApp();
      });
    document
      .getElementById("btn-bulk-delete")
      ?.addEventListener("click", () => {
        const ids = Array.from(state.selectedIds);
        if (ids.length === 0) return showToast("No entries selected.", "error");

        showConfirm(
          "Delete selected entries?",
          `${ids.length} entries will be permanently removed.`,
          async () => {
            let ok = 0;
            let fail = 0;
            const CHUNK = 500;
            for (let i = 0; i < ids.length; i += CHUNK) {
              const chunk = ids.slice(i, i + CHUNK);
              try {
                const res = await apiFetch("/media?bulk_delete=1", {
                  method: "POST",
                  body: JSON.stringify({ ids: chunk }),
                });
                ok += Number(res?.deleted || 0);
                const requested = Number(res?.requested || chunk.length);
                fail += Math.max(0, requested - Number(res?.deleted || 0));
              } catch {
                fail += chunk.length;
              }
            }
            showToast(
              `Deleted ${ok} entries${fail ? `, ${fail} failed` : ""}`,
              ok > 0 ? "success" : "error",
            );
            state.selectedIds.clear();
            state.bulkMode = false;
            await fetchMedia(true, true);
            renderApp();
          },
        );
      });
  }
}
