/** Main application render – shell only (Phase 3 - static bounds) */
import { store } from "../state/store.js";
import { escapeHtml } from "../utils/format.js";
import { logout } from "../api/auth.js";
import { showToast } from "./toast.js";
import { attachSettingsButtonListener } from "../features/settings.js";
import { renderControls } from "./components/controls.js";
import { renderMediaCards } from "./components/mediaCards.js";
import { renderStatsHost } from "./components/stats.js";
import { renderBulkBar } from "./components/bulkBar.js";
import {
  exportJSON,
  exportAllCSV,
  openExportTypeDialog,
  triggerImport,
} from "../features/import-export/index.js";
import { fetchMedia } from "../services/media.js";

export function renderApp(): void {
  const app = document.getElementById("app")!;
  const state = store.get();

  // Ensure we don't duplicate listeners by checking a custom attribute
  if (app.getAttribute("data-initialized") === "true" && state.token) {
    return; // Already rendered shell
  }

  if (!state.token) {
    app.removeAttribute("data-initialized");
    renderAuthScreen(app);
    return;
  }

  renderDashboard(app);
  app.setAttribute("data-initialized", "true");
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
    const username = (document.getElementById("auth-user") as HTMLInputElement).value;
    const password = (document.getElementById("auth-pass") as HTMLInputElement).value;
    const errorEl = document.getElementById("auth-error")!;
    const buttons = form.querySelectorAll("button");

    buttons.forEach((b) => {
      b.disabled = true;
      if (b.getAttribute("data-action") === action)
        b.innerHTML = `<span class="spinner"></span>`;
    });
    errorEl.textContent = "";

    try {
      const { login: doLogin, register: doRegister } =
        await import("../api/auth.js");
      const res =
        action === "register"
          ? await doRegister(username, password)
          : await doLogin(username, password);

      store.set(() => ({
        token: res.token,
        username: res.username,
        media: [],
        search: "",
        filterType: "",
        filterStatus: "",
        sortBy: "last_updated",
        loading: false,
        loadingMore: false,
        page: 1,
        limit: 24,
        hasMore: false,
        total: 0,
        bulkMode: false,
        selectedIds: new Set<string>(),
        globalStats: null,
      }));

      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);

      await fetchMedia();
    } catch (err: any) {
      const serverMsg = err?.message || "";
      errorEl.textContent =
        serverMsg ||
        (action === "register"
          ? "Registration failed. Username may be taken."
          : "Login failed.");
      buttons.forEach((b) => {
        b.disabled = false;
        const act = b.getAttribute("data-action");
        if (act === "login") b.textContent = "Login";
        else if (act === "register") b.textContent = "Register";
      });
    }
  });

  setTimeout(
    () => (document.getElementById("auth-user") as HTMLInputElement)?.focus(),
    50
  );
}

function renderDashboard(app: HTMLElement): void {
  const state = store.get();

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img src="/favicon.svg" alt="logo" width="32" height="32" class="sidebar-brand-logo" />
          <h1>Chronicle</h1>
        </div>
        <div class="sidebar-nav">
          <button id="btn-sidebar-add" class="btn-primary" style="width: 100%; margin-bottom: 12px; display: flex; justify-content: flex-start; padding: 12px 16px; align-items: center; gap: 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Entry
          </button>
          <div style="display:flex; flex-direction:column; gap:4px; margin-bottom: 12px;">
            <button id="btn-sidebar-home" class="btn-ghost" style="width: 100%; display: flex; justify-content: flex-start; padding: 12px 16px; align-items: center; gap: 12px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Library
            </button>
            <button id="btn-sidebar-analytics" class="btn-ghost" style="width: 100%; display: flex; justify-content: flex-start; padding: 12px 16px; align-items: center; gap: 12px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              Analytics
            </button>
          </div>
          <div class="sidebar-divider" style="height: 1px; background: var(--border); margin: 8px 0;"></div>
          
          <button id="btn-import" class="sidebar-link">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
             Import
          </button>
          
          <div class="export-menu-wrap" style="width: 100%;">
            <button id="btn-export" class="sidebar-link" style="width: 100%;">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
               Export
            </button>
            <div class="export-menu" id="export-menu">
              <button id="btn-export-json" class="btn-ghost">Export JSON</button>
              <button id="btn-export-csv" class="btn-ghost">Export CSV</button>
              <button id="btn-export-by-type" class="btn-ghost">Export by Type</button>
            </div>
          </div>
        </div>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${escapeHtml(state.username).substring(0, 2)}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${escapeHtml(state.username)}</div>
            </div>
          </div>
          <div class="sidebar-user-actions" style="display: flex; gap: 8px; margin-top: 12px; margin-bottom: 4px;">
            <button id="btn-settings" class="btn-ghost" style="flex: 1; align-items:center; justify-content: center; padding: 10px; font-size:0.85rem;" title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" style="margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Settings
            </button>
            <button id="btn-logout" class="btn-ghost" style="flex: 1; align-items:center; justify-content: center; padding: 10px; font-size:0.85rem;" title="Logout">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" style="margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Logout
            </button>
          </div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <button id="btn-mobile-menu" class="btn-ghost mobile-only-btn" aria-label="Open Menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div class="topbar-title">Library</div>
          <button id="btn-mobile-add" class="btn-ghost mobile-only-btn" aria-label="Add Entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </header>
        <div class="page-content">
          <div id="controls-host"></div>
          <div id="stats-host"></div>
          <div id="bulk-bar-host"></div>
          <div id="media-grid" class="grid"></div>
          <div class="load-more-wrap">
            <button id="btn-load-more" class="btn-ghost">Load more</button>
          </div>
          <button id="btn-add-fab" class="btn-fab" aria-label="Add Entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </main>
    </div>
  `;

  attachSettingsButtonListener();

  // Topbar and Sidebar actions
  document.getElementById("btn-logout")?.addEventListener("click", () => logout());
  document.getElementById("btn-import")?.addEventListener("click", triggerImport);

  // Export menu
  document.getElementById("btn-export")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("export-menu")?.classList.toggle("open");
  });
  document.getElementById("btn-export-json")?.addEventListener("click", async () => {
    document.getElementById("export-menu")?.classList.remove("open");
    showToast("Exporting JSON... Please wait.", "success");
    try {
      await exportJSON();
    } catch {
      showToast("Failed to export JSON.", "error");
    }
  });
  document.getElementById("btn-export-csv")?.addEventListener("click", async () => {
    document.getElementById("export-menu")?.classList.remove("open");
    showToast("Exporting CSV... Please wait.", "success");
    try {
      await exportAllCSV();
    } catch {
      showToast("Failed to export CSV.", "error");
    }
  });
  document.getElementById("btn-export-by-type")?.addEventListener("click", () => {
    document.getElementById("export-menu")?.classList.remove("open");
    openExportTypeDialog();
  });
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("#btn-export")) {
      document.getElementById("export-menu")?.classList.remove("open");
    }
    
    const sidebar = document.querySelector(".sidebar");
    if (sidebar?.classList.contains("open")) {
      if (!target.closest(".sidebar") && !target.closest("#btn-mobile-menu")) {
        sidebar.classList.remove("open");
      }
    }
  });
  
  // Mobile Topbar Actions
  document.getElementById("btn-mobile-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelector(".sidebar")?.classList.toggle("open");
  });

  const openAppModal = async () => {
    const { openModal } = await import("../features/media/modal.js");
    openModal();
  };

  document.getElementById("btn-mobile-add")?.addEventListener("click", openAppModal);
  document.getElementById("btn-sidebar-add")?.addEventListener("click", openAppModal);
  
  // Floating Action Button
  document.getElementById("btn-add-fab")?.addEventListener("click", openAppModal);

  // Routing Toggles
  const showLibrary = () => {
    document.getElementById("media-grid")!.style.display = "grid";
    document.getElementById("controls-host")!.style.display = "block";
    document.getElementById("bulk-bar-host")!.style.display = "block";
    const loadBtn = document.getElementById("btn-load-more");
    if (loadBtn && loadBtn.parentElement) loadBtn.parentElement.style.display = "flex";
    document.querySelector(".topbar-title")!.textContent = "Chronicle";
    document.getElementById("stats-host")!.style.display = "none";
    if (window.innerWidth <= 768) document.querySelector(".sidebar")?.classList.remove("open");
  };
  const showAnalytics = () => {
    document.getElementById("media-grid")!.style.display = "none";
    document.getElementById("controls-host")!.style.display = "none";
    document.getElementById("bulk-bar-host")!.style.display = "none";
    const loadBtn = document.getElementById("btn-load-more");
    if (loadBtn && loadBtn.parentElement) loadBtn.parentElement.style.display = "none";
    document.querySelector(".topbar-title")!.textContent = "Analytics Dashboard";
    document.getElementById("stats-host")!.style.display = "block";
    if (window.innerWidth <= 768) document.querySelector(".sidebar")?.classList.remove("open");
  };

  document.getElementById("btn-sidebar-home")?.addEventListener("click", showLibrary);
  document.getElementById("btn-sidebar-analytics")?.addEventListener("click", showAnalytics);
  
  // Set default route
  showLibrary();

  // Force-render components onto the fresh DOM
  renderControls();
  renderMediaCards();
  renderBulkBar();
  renderStatsHost();
}
