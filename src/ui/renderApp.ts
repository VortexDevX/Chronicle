/** Main application render – shell only (Phase 3 - static bounds) */
import { store } from "../state/store.js";
import { createInitialState } from "../state/core.js";
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
import { fetchMedia, fetchStats } from "../services/media.js";

function setDisplay(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

async function runButtonTask(
  button: HTMLButtonElement,
  loadingLabel: string,
  task: () => Promise<void>,
): Promise<void> {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${loadingLabel}`;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

export function renderApp(): void {
  const app = document.getElementById("app")!;
  const state = store.get();

  if (app.getAttribute("data-initialized") === "true" && state.token) {
    return;
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
    <div class="auth-bg">
      <div class="auth-container">
        <div class="auth-brand">
          <img src="/favicon.png" alt="Chronicle logo" width="48" height="48" class="auth-brand-logo" />
          <h1 class="auth-brand-name">Chronicle</h1>
        </div>
        <p class="auth-subtitle">Track your anime, manhwa, donghua &amp; light novels</p>
        <form id="auth-form" class="auth-form-inner">
          <div class="auth-form-group">
            <label for="auth-user">Username</label>
            <div class="auth-input-wrap">
              <svg class="auth-input-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <input type="text" id="auth-user" placeholder="Enter username" required autocomplete="username">
            </div>
          </div>
          <div class="auth-form-group">
            <label for="auth-pass">Password</label>
            <div class="auth-input-wrap">
              <svg class="auth-input-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" id="auth-pass" placeholder="Enter password" required autocomplete="current-password">
            </div>
          </div>
          <div id="auth-error" class="auth-error"></div>
          <div class="auth-actions">
            <button type="submit" class="btn-primary auth-btn" data-action="login">Login</button>
            <button type="submit" class="auth-btn" data-action="register">Register</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById("auth-form")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const clickedBtn =
      (e.submitter as HTMLButtonElement) ||
      form.querySelector("[data-action='login']");
    const action = clickedBtn?.getAttribute("data-action") || "login";
    const username = (document.getElementById("auth-user") as HTMLInputElement)
      .value;
    const password = (document.getElementById("auth-pass") as HTMLInputElement)
      .value;
    const errorEl = document.getElementById("auth-error")!;
    const buttons = form.querySelectorAll("button");

    buttons.forEach((b) => {
      b.disabled = true;
      if (b.getAttribute("data-action") === action)
        b.innerHTML = `<span class="spinner"></span> ${
          action === "register" ? "Registering..." : "Logging in..."
        }`;
    });
    errorEl.textContent = "";

    try {
      const { login: doLogin, register: doRegister } =
        await import("../api/auth.js");
      const res =
        action === "register"
          ? await doRegister(username, password)
          : await doLogin(username, password);

      store.set(() =>
        createInitialState({
          token: res.token,
          username: res.username,
        }),
      );

      localStorage.setItem("token", res.token);
      localStorage.setItem("username", res.username);

      await fetchMedia();
    } catch (err) {
      const serverMsg = err instanceof Error ? err.message : "";
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
    50,
  );
}

function setActiveNav(activeId: string): void {
  document.querySelectorAll(".sidebar-nav-route").forEach((btn) => {
    btn.classList.toggle("nav-active", (btn as HTMLElement).id === activeId);
  });
}

function closeMobileSidebar(): void {
  if (window.innerWidth <= 1024) {
    document.querySelector(".sidebar")?.classList.remove("open");
    document.getElementById("sidebar-overlay")?.classList.remove("active");
  }
}

function renderDashboard(app: HTMLElement): void {
  const state = store.get();
  const avatarLetters = escapeHtml(state.username)
    .substring(0, 2)
    .toUpperCase();

  app.innerHTML = `
    <div class="shell">
      <div id="sidebar-overlay" class="sidebar-overlay"></div>

      <!-- ── Sidebar ── -->
      <aside class="sidebar" role="navigation" aria-label="Main navigation">

        <div class="sidebar-brand">
          <img src="/favicon.png" alt="Chronicle logo" width="32" height="32" class="sidebar-brand-logo" />
          <h1>Chronicle</h1>
        </div>

        <div class="sidebar-nav">
          <!-- Primary CTA -->
          <button id="btn-sidebar-add" class="btn-primary sidebar-nav-btn sidebar-nav-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Add Entry</span>
          </button>

          <!-- Nav routes -->
          <div class="sidebar-nav-group">
            <button id="btn-sidebar-home" class="btn-ghost sidebar-nav-btn sidebar-nav-route nav-active">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span>Library</span>
            </button>
            <button id="btn-sidebar-analytics" class="btn-ghost sidebar-nav-btn sidebar-nav-route">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
              </svg>
              <span>Analytics</span>
            </button>
          </div>

          <div class="sidebar-divider"></div>

          <!-- Utility links -->
          <button id="btn-import" class="sidebar-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Import</span>
          </button>

          <div class="export-menu-wrap">
            <button id="btn-export" class="sidebar-link">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export</span>
              <svg class="export-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="export-menu" id="export-menu">
              <button id="btn-export-json" class="btn-ghost">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Export JSON
              </button>
              <button id="btn-export-csv" class="btn-ghost">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
                Export CSV
              </button>
              <button id="btn-export-by-type" class="btn-ghost">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Export by Type
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${avatarLetters}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${escapeHtml(state.username)}</div>
            </div>
          </div>
          <div class="sidebar-user-actions">
            <button id="btn-settings" class="btn-ghost sidebar-footer-btn" title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
            <button id="btn-logout" class="btn-ghost sidebar-footer-btn" title="Logout">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <!-- ── Main ── -->
      <main class="main">
        <header class="topbar">
          <button id="btn-mobile-menu" class="btn-ghost mobile-only-btn" aria-label="Open Menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-title">Library</div>
          <button id="btn-mobile-add" class="btn-ghost mobile-only-btn" aria-label="Add Entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </main>
    </div>
  `;

  attachSettingsButtonListener();

  // ── Auth & data actions
  document
    .getElementById("btn-logout")
    ?.addEventListener("click", () => logout());
  document
    .getElementById("btn-import")
    ?.addEventListener("click", triggerImport);

  // ── Export dropdown
  document.getElementById("btn-export")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("export-menu");
    const chevron = document.querySelector(".export-chevron") as HTMLElement;
    menu?.classList.toggle("open");
    if (chevron)
      chevron.style.transform = menu?.classList.contains("open")
        ? "rotate(180deg)"
        : "";
  });
  document
    .getElementById("btn-export-json")
    ?.addEventListener("click", async () => {
      document.getElementById("export-menu")?.classList.remove("open");
      const button = document.getElementById(
        "btn-export-json",
      ) as HTMLButtonElement;
      try {
        await runButtonTask(button, "Exporting...", async () => {
          await exportJSON(({ fetched, total }) => {
            button.innerHTML = `<span class="spinner"></span> Exporting ${fetched}${total ? `/${total}` : ""}`;
          });
        });
      } catch {
        showToast("Failed to export JSON.", "error");
      }
    });
  document
    .getElementById("btn-export-csv")
    ?.addEventListener("click", async () => {
      document.getElementById("export-menu")?.classList.remove("open");
      const button = document.getElementById(
        "btn-export-csv",
      ) as HTMLButtonElement;
      try {
        await runButtonTask(button, "Exporting...", async () => {
          await exportAllCSV(({ fetched, total }) => {
            button.innerHTML = `<span class="spinner"></span> Exporting ${fetched}${total ? `/${total}` : ""}`;
          });
        });
      } catch {
        showToast("Failed to export CSV.", "error");
      }
    });
  document
    .getElementById("btn-export-by-type")
    ?.addEventListener("click", () => {
      document.getElementById("export-menu")?.classList.remove("open");
      openExportTypeDialog();
    });

  // ── Mobile sidebar
  document.getElementById("btn-mobile-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelector(".sidebar")?.classList.toggle("open");
    document.getElementById("sidebar-overlay")?.classList.toggle("active");
  });
  document
    .getElementById("sidebar-overlay")
    ?.addEventListener("click", () => closeMobileSidebar());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileSidebar();
  });
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".export-menu-wrap")) {
      document.getElementById("export-menu")?.classList.remove("open");
    }
  });

  // ── Open modal
  const openAppModal = async () => {
    const { openModal } = await import("../features/media/modal.js");
    openModal();
  };
  document
    .getElementById("btn-mobile-add")
    ?.addEventListener("click", openAppModal);
  document
    .getElementById("btn-sidebar-add")
    ?.addEventListener("click", openAppModal);
  document
    .getElementById("btn-add-fab")
    ?.addEventListener("click", openAppModal);

  // ── Routing
  const showLibrary = () => {
    setDisplay("media-grid", "grid");
    setDisplay("controls-host", "block");
    setDisplay("bulk-bar-host", "block");
    const loadBtn = document.getElementById("btn-load-more");
    if (loadBtn?.parentElement) loadBtn.parentElement.style.display = "flex";
    const title = document.querySelector(".topbar-title");
    if (title) title.textContent = "Library";
    setDisplay("stats-host", "none");
    setActiveNav("btn-sidebar-home");
    closeMobileSidebar();
  };
  const showAnalytics = async () => {
    setDisplay("media-grid", "none");
    setDisplay("controls-host", "none");
    setDisplay("bulk-bar-host", "none");
    const loadBtn = document.getElementById("btn-load-more");
    if (loadBtn?.parentElement) loadBtn.parentElement.style.display = "none";
    const title = document.querySelector(".topbar-title");
    if (title) title.textContent = "Analytics";
    setDisplay("stats-host", "block");
    setActiveNav("btn-sidebar-analytics");
    closeMobileSidebar();
    // ← re-render charts every time analytics is opened
    if (!store.get().globalStats) {
      await fetchStats();
    }
    renderStatsHost();
  };
  document
    .getElementById("btn-sidebar-home")
    ?.addEventListener("click", showLibrary);
  document
    .getElementById("btn-sidebar-analytics")
    ?.addEventListener("click", showAnalytics);
  showLibrary();

  // ── Render components
  renderControls();
  renderMediaCards();
  renderBulkBar();
  renderStatsHost();
}
