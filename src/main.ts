interface MediaItem {
  _id: string;
  title: string;
  media_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  rating?: number;
  notes?: string;
  last_updated: string;
}

const state = {
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
  media: [] as MediaItem[],
  search: "",
  filterType: "",
  filterStatus: "",
  sortBy: "last_updated",
  loading: false,
};

// ── Cover Image Cache (Jikan API) ────────────────────────────────

const coverCache = new Map<string, string | null>();
let jikanQueue: { title: string; id: string }[] = [];
let jikanProcessing = false;

async function processJikanQueue() {
  if (jikanProcessing || jikanQueue.length === 0) return;
  jikanProcessing = true;

  while (jikanQueue.length > 0) {
    const { title, id } = jikanQueue.shift()!;
    if (coverCache.has(title)) continue;

    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`
      );
      if (res.ok) {
        const json = await res.json();
        const imageUrl =
          json.data?.[0]?.images?.jpg?.small_image_url || null;
        coverCache.set(title, imageUrl);

        // Update the specific card thumbnail if element exists
        const thumbEl = document.querySelector(
          `[data-cover-id="${id}"]`
        ) as HTMLElement;
        if (thumbEl && imageUrl) {
          thumbEl.style.backgroundImage = `url(${imageUrl})`;
          thumbEl.classList.add("thumb-loaded");
        }
      } else {
        coverCache.set(title, null);
      }
    } catch {
      coverCache.set(title, null);
    }

    // Rate limit: 1 request per second (Jikan limit)
    await new Promise((r) => setTimeout(r, 1100));
  }

  jikanProcessing = false;
}

function queueCoverFetch(title: string, id: string) {
  if (coverCache.has(title)) return;
  if (!jikanQueue.some((q) => q.title === title)) {
    jikanQueue.push({ title, id });
    processJikanQueue();
  }
}

// ── Utilities ────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
}

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function progressLabel(mediaType: string): string {
  if (mediaType === "Anime" || mediaType === "Donghua") return "ep";
  return "ch";
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Toast System ─────────────────────────────────────────────────

function showToast(message: string, type: "error" | "success" = "error") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3200);
}

// ── Confirm Dialog ───────────────────────────────────────────────

function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void
) {
  const dialog = document.getElementById("confirm-dialog") as HTMLDialogElement;
  (document.getElementById("confirm-title") as HTMLElement).textContent = title;
  (document.getElementById("confirm-message") as HTMLElement).textContent =
    message;

  const okBtn = document.getElementById("confirm-ok")!;
  const cancelBtn = document.getElementById("confirm-cancel")!;

  // Clone & replace to remove old listeners
  const newOk = okBtn.cloneNode(true) as HTMLElement;
  const newCancel = cancelBtn.cloneNode(true) as HTMLElement;
  okBtn.replaceWith(newOk);
  cancelBtn.replaceWith(newCancel);

  newOk.addEventListener("click", () => {
    dialog.close();
    onConfirm();
  });
  newCancel.addEventListener("click", () => dialog.close());

  dialog.showModal();
}

// ── Export System ────────────────────────────────────────────────

function exportJSON() {
  const payload = state.media.map(
    ({ _id, title, media_type, status, progress_current, progress_total, rating, notes, last_updated }) => ({
      title,
      media_type,
      status,
      progress_current,
      progress_total,
      rating: rating ?? null,
      notes: notes ?? "",
      last_updated,
    })
  );
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `chronicle-export-${dateStamp()}.json`);
  showToast(`Exported ${payload.length} entries as JSON`, "success");
}

function exportCSV() {
  const headers = [
    "title",
    "media_type",
    "status",
    "progress_current",
    "progress_total",
    "rating",
    "notes",
    "last_updated",
  ];
  const rows = state.media.map((m) =>
    headers
      .map((h) => {
        const val = (m as any)[h] ?? "";
        const str = String(val);
        // Escape quotes and wrap in quotes if it contains comma/quote/newline
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, `chronicle-export-${dateStamp()}.csv`);
  showToast(`Exported ${state.media.length} entries as CSV`, "success");
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Import System ───────────────────────────────────────────────

function triggerImport() {
  const fileInput = document.getElementById("import-file") as HTMLInputElement;
  fileInput.value = "";
  fileInput.click();
}

document.getElementById("import-file")?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const entries = JSON.parse(text);

    if (!Array.isArray(entries)) {
      showToast("Invalid format: expected a JSON array.", "error");
      return;
    }

    const validFields = [
      "title",
      "media_type",
      "status",
      "progress_current",
      "progress_total",
      "rating",
      "notes",
    ];

    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (!entry.title || !entry.media_type || !entry.status) {
        skipped++;
        continue;
      }

      const clean: Record<string, any> = {};
      for (const key of validFields) {
        if (entry[key] !== undefined) clean[key] = entry[key];
      }

      try {
        await apiFetch("/media", {
          method: "POST",
          body: JSON.stringify(clean),
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    showToast(
      `Imported ${imported} entries${skipped > 0 ? `, ${skipped} skipped` : ""}`,
      imported > 0 ? "success" : "error"
    );

    if (imported > 0) fetchMedia();
  } catch {
    showToast("Failed to parse file. Must be valid JSON.", "error");
  }
});

// ── API Helpers ──────────────────────────────────────────────────

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`/api${endpoint}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return res.json();
}

async function fetchMedia() {
  state.loading = true;
  renderApp();
  try {
    state.media = await apiFetch("/media");
  } catch (err) {
    showToast("Failed to load your entries. Please try again.", "error");
  }
  state.loading = false;
  renderApp();
}

// ── Stats ────────────────────────────────────────────────────────

function renderStats(): string {
  const total = state.media.length;
  if (total === 0) return "";

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;
  let totalProgress = 0;
  let totalPossible = 0;

  state.media.forEach((m) => {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byType[m.media_type] = (byType[m.media_type] || 0) + 1;
    if (m.rating) {
      ratingSum += m.rating;
      ratingCount++;
    }
    totalProgress += m.progress_current;
    if (m.progress_total) totalPossible += m.progress_total;
  });

  const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";
  const completionRate =
    totalPossible > 0
      ? Math.round((totalProgress / totalPossible) * 100)
      : 0;

  const watching = byStatus["Watching/Reading"] || 0;
  const completed = byStatus["Completed"] || 0;
  const planned = byStatus["Planned"] || 0;
  const onHold = byStatus["On Hold"] || 0;
  const dropped = byStatus["Dropped"] || 0;

  // Type breakdown chips
  const typeChips = Object.entries(byType)
    .map(([type, count]) => `<span class="stat-chip"><strong>${count}</strong>&nbsp;${escapeHtml(type)}</span>`)
    .join("");

  return `
    <div class="stats-section">
      <div class="stats-bar">
        <span class="stat-chip"><strong>${total}</strong>&nbsp;Total</span>
        <span class="stat-chip stat-active"><strong>${watching}</strong>&nbsp;Active</span>
        <span class="stat-chip stat-completed"><strong>${completed}</strong>&nbsp;Completed</span>
        <span class="stat-chip"><strong>${planned}</strong>&nbsp;Planned</span>
        ${onHold ? `<span class="stat-chip stat-hold"><strong>${onHold}</strong>&nbsp;On Hold</span>` : ""}
        ${dropped ? `<span class="stat-chip stat-dropped"><strong>${dropped}</strong>&nbsp;Dropped</span>` : ""}
      </div>
      <div class="stats-bar stats-secondary">
        ${typeChips}
        <span class="stat-chip stat-accent">★ ${avgRating} avg</span>
        <span class="stat-chip stat-accent">${completionRate}% progress</span>
      </div>
    </div>
  `;
}

// ── App Initialization & Routing ─────────────────────────────────

function renderApp() {
  const app = document.getElementById("app")!;

  if (!state.token) {
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

      // Show loading
      const buttons = form.querySelectorAll("button");
      buttons.forEach((b) => {
        b.disabled = true;
        if (b.getAttribute("data-action") === action) {
          b.innerHTML = `<span class="spinner"></span>`;
        }
      });
      errorEl.textContent = "";

      try {
        const res = await apiFetch("/auth", {
          method: "POST",
          body: JSON.stringify({ action, username, password }),
        });
        state.token = res.token;
        state.username = res.username;
        localStorage.setItem("token", res.token);
        localStorage.setItem("username", res.username);
        await init();
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

    // Focus username input
    setTimeout(() => {
      (document.getElementById("auth-user") as HTMLInputElement)?.focus();
    }, 50);

    return;
  }

  // ── Dashboard ──
  app.innerHTML = `
    <div class="container">
      <header>
        <h2>Chronicle</h2>
        <div class="header-right">
          <button id="btn-import" class="btn-ghost" title="Import JSON">↑ Import</button>
          <div class="export-menu-wrap">
            <button id="btn-export" class="btn-ghost" title="Export data">↓ Export</button>
            <div class="export-menu" id="export-menu">
              <button id="btn-export-json" class="btn-ghost">Export JSON</button>
              <button id="btn-export-csv" class="btn-ghost">Export CSV</button>
            </div>
          </div>
          <span class="header-user">${escapeHtml(state.username)}</span>
          <button id="btn-logout" class="btn-ghost">Logout</button>
        </div>
      </header>
      ${renderStats()}
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
        <button class="btn-primary" id="btn-add">+ Add Entry</button>
      </div>
      <div id="media-grid" class="grid"></div>
    </div>
  `;

  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document
    .getElementById("btn-add")
    ?.addEventListener("click", () => openModal());

  // Export menu toggle
  document.getElementById("btn-export")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("export-menu")?.classList.toggle("open");
  });
  document
    .getElementById("btn-export-json")
    ?.addEventListener("click", () => {
      document.getElementById("export-menu")?.classList.remove("open");
      exportJSON();
    });
  document
    .getElementById("btn-export-csv")
    ?.addEventListener("click", () => {
      document.getElementById("export-menu")?.classList.remove("open");
      exportCSV();
    });
  // Close export menu on outside click
  document.addEventListener(
    "click",
    () => {
      document.getElementById("export-menu")?.classList.remove("open");
    },
    { once: true }
  );

  // Import
  document
    .getElementById("btn-import")
    ?.addEventListener("click", triggerImport);

  // Search with debounce
  let searchTimeout: ReturnType<typeof setTimeout>;
  document.getElementById("search")?.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = (e.target as HTMLInputElement).value;
      renderMediaCards();
    }, 150);
  });

  // Filter & sort (change event, not input)
  ["filter-type", "filter-status", "sort-by"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      const key =
        id === "filter-type"
          ? "filterType"
          : id === "filter-status"
            ? "filterStatus"
            : "sortBy";
      (state as any)[key] = target.value;
      renderMediaCards();
    });
  });

  renderMediaCards();
}

// ── Render Media Cards ───────────────────────────────────────────

function renderMediaCards() {
  const container = document.getElementById("media-grid");
  if (!container) return;

  if (state.loading) {
    container.innerHTML = `<div class="loading" style="grid-column:1/-1"><div class="spinner"></div></div>`;
    return;
  }

  let filtered = state.media.filter(
    (m) =>
      (!state.search ||
        m.title.toLowerCase().includes(state.search.toLowerCase())) &&
      (!state.filterType || m.media_type === state.filterType) &&
      (!state.filterStatus || m.status === state.filterStatus)
  );

  filtered.sort((a, b) => {
    if (state.sortBy === "progress") {
      const pA = a.progress_current / (a.progress_total || 1);
      const pB = b.progress_current / (b.progress_total || 1);
      return pB - pA;
    }
    if (state.sortBy === "rating") {
      return (b.rating || 0) - (a.rating || 0);
    }
    if (state.sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    return (
      new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
    );
  });

  if (filtered.length === 0) {
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
    return;
  }

  container.innerHTML = filtered
    .map((m) => {
      const pct = m.progress_total
        ? Math.min(
            100,
            Math.round((m.progress_current / m.progress_total) * 100)
          )
        : 0;
      const unit = progressLabel(m.media_type);
      const ratingStr = m.rating
        ? `<span class="card-rating"><span class="star">★</span>${m.rating}/10</span>`
        : "";
      const totalStr = m.progress_total ? m.progress_total : "?";

      // Stale indicator: active entries not updated in 14+ days
      const isStale =
        m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
      const staleClass = isStale ? " card-stale" : "";
      const staleBadge = isStale
        ? `<span class="badge badge-stale" title="Not updated in ${daysSince(m.last_updated)} days">⏱ STALE</span>`
        : "";

      // Cover thumbnail for anime
      const isAnime =
        m.media_type === "Anime" || m.media_type === "Donghua";
      const cachedCover = coverCache.get(m.title);
      let thumbHtml = "";
      if (isAnime) {
        if (cachedCover) {
          thumbHtml = `<div class="card-thumb thumb-loaded" data-cover-id="${m._id}" style="background-image:url(${cachedCover})"></div>`;
        } else {
          thumbHtml = `<div class="card-thumb" data-cover-id="${m._id}"></div>`;
          queueCoverFetch(m.title, m._id);
        }
      }

      return `
      <div class="card${staleClass}">
        <div class="card-header">
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
}

// ── Modal & Form Logic ───────────────────────────────────────────

function openModal(item?: MediaItem) {
  const modal = document.getElementById("media-modal") as HTMLDialogElement;
  (document.getElementById("modal-title") as HTMLElement).textContent = item
    ? "Edit Entry"
    : "Add Entry";
  (document.getElementById("media-id") as HTMLInputElement).value =
    item?._id || "";
  (document.getElementById("media-title") as HTMLInputElement).value =
    item?.title || "";
  (document.getElementById("media-type") as HTMLSelectElement).value =
    item?.media_type || "Anime";
  (document.getElementById("media-status") as HTMLSelectElement).value =
    item?.status || "Watching/Reading";
  (
    document.getElementById("media-progress-current") as HTMLInputElement
  ).value = item?.progress_current.toString() || "0";
  (document.getElementById("media-progress-total") as HTMLInputElement).value =
    item?.progress_total.toString() || "0";
  (document.getElementById("media-rating") as HTMLInputElement).value =
    item?.rating?.toString() || "";
  (document.getElementById("media-notes") as HTMLTextAreaElement).value =
    item?.notes || "";

  // Reset save button state (in case previous save left it spinning)
  const saveBtn = modal.querySelector(".btn-primary") as HTMLButtonElement;
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }

  modal.showModal();

  // Focus the title input after modal opens
  setTimeout(() => {
    (document.getElementById("media-title") as HTMLInputElement)?.focus();
  }, 50);
}

document
  .getElementById("media-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = (document.getElementById("media-id") as HTMLInputElement).value;
    const saveBtn = (e.target as HTMLFormElement).querySelector(
      ".btn-primary"
    ) as HTMLButtonElement;

    const data = {
      title: (document.getElementById("media-title") as HTMLInputElement).value,
      media_type: (document.getElementById("media-type") as HTMLSelectElement)
        .value,
      status: (document.getElementById("media-status") as HTMLSelectElement)
        .value,
      progress_current: parseInt(
        (document.getElementById("media-progress-current") as HTMLInputElement)
          .value,
        10
      ),
      progress_total: parseInt(
        (document.getElementById("media-progress-total") as HTMLInputElement)
          .value,
        10
      ),
      rating:
        parseInt(
          (document.getElementById("media-rating") as HTMLInputElement).value,
          10
        ) || undefined,
      notes: (document.getElementById("media-notes") as HTMLTextAreaElement)
        .value,
    };

    // Loading state on save button
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner"></span>`;

    try {
      if (id) {
        await apiFetch(`/media?id=${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/media", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }
      (document.getElementById("media-modal") as HTMLDialogElement).close();
      showToast(id ? "Entry updated" : "Entry added", "success");
      fetchMedia();
    } catch {
      showToast("Failed to save. Please try again.", "error");
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

// ── Event Delegation for Card Buttons ────────────────────────────

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
          fetchMedia();
        } catch {
          showToast("Failed to delete. Please try again.", "error");
        }
      }
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
        // Silently refresh to sync
        state.media = await apiFetch("/media");
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

// ── Auth ─────────────────────────────────────────────────────────

function logout() {
  localStorage.clear();
  state.token = "";
  state.username = "";
  state.media = [];
  state.search = "";
  state.filterType = "";
  state.filterStatus = "";
  state.sortBy = "last_updated";
  renderApp();
}

async function init() {
  if (state.token) {
    try {
      await fetchMedia();
    } catch {
      // Handled by apiFetch -> logout() on 401
    }
  } else {
    renderApp();
  }
}

init();
