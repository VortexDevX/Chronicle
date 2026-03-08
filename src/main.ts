import * as XLSX from "xlsx";

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
  loadingMore: false,
  page: 1,
  limit: 24,
  hasMore: false,
  total: 0,
  bulkMode: false,
  selectedIds: new Set<string>(),
};

type ImportRow = {
  title: string;
  media_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  rating?: number;
  notes?: string;
};

// ── Cover Image Cache (Jikan API) ────────────────────────────────

type CoverCacheEntry = {
  url: string | null;
  ts: number;
};

const COVER_CACHE_KEY = "chronicle:cover-cache:v2";
const COVER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const COVER_CACHE_MAX = 600;

const coverCache = new Map<string, CoverCacheEntry>();
let jikanQueue: { title: string; id: string }[] = [];
let jikanProcessing = false;

function loadCoverCache() {
  try {
    const raw = localStorage.getItem(COVER_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CoverCacheEntry>;
    const now = Date.now();
    Object.entries(parsed).forEach(([title, entry]) => {
      if (!entry || typeof entry.ts !== "number") return;
      if (now - entry.ts > COVER_CACHE_TTL_MS) return;
      coverCache.set(title, { url: entry.url ?? null, ts: entry.ts });
    });
  } catch {
    // Ignore corrupt cache payload
  }
}

function persistCoverCache() {
  try {
    const entries = Array.from(coverCache.entries());
    const trimmed = entries
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, COVER_CACHE_MAX);
    const payload = Object.fromEntries(trimmed);
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota and serialization errors
  }
}

function getCachedCover(title: string): string | null | undefined {
  const entry = coverCache.get(title);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > COVER_CACHE_TTL_MS) {
    coverCache.delete(title);
    return undefined;
  }
  return entry.url;
}

function setCachedCover(title: string, url: string | null) {
  coverCache.set(title, { url, ts: Date.now() });
  persistCoverCache();
}

async function processJikanQueue() {
  if (jikanProcessing || jikanQueue.length === 0) return;
  jikanProcessing = true;

  while (jikanQueue.length > 0) {
    const { title, id } = jikanQueue.shift()!;
    if (getCachedCover(title) !== undefined) continue;

    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
      );
      if (res.ok) {
        const json = await res.json();
        const imageUrl = json.data?.[0]?.images?.jpg?.large_image_url || null;
        setCachedCover(title, imageUrl);

        // Update the specific card thumbnail if element exists
        const thumbEl = document.querySelector(
          `[data-cover-id="${id}"]`,
        ) as HTMLElement;
        if (thumbEl && imageUrl) {
          thumbEl.style.backgroundImage = `url(${imageUrl})`;
          thumbEl.classList.add("thumb-loaded");
        }
      } else {
        setCachedCover(title, null);
      }
    } catch {
      setCachedCover(title, null);
    }

    // Rate limit: 1 request per second (Jikan limit)
    await new Promise((r) => setTimeout(r, 1100));
  }

  jikanProcessing = false;
}

function queueCoverFetch(title: string, id: string) {
  if (getCachedCover(title) !== undefined) return;
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
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
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

type MediaLookup = {
  title?: string;
  total?: number;
  source: "AniList" | "MAL";
};

async function lookupAniList(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  const anilistType =
    mediaType === "Anime" || mediaType === "Donghua" ? "ANIME" : "MANGA";

  const query = `
    query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        title { romaji english native }
        episodes
        chapters
        volumes
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      variables: { search: title, type: anilistType },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const media = json?.data?.Media;
  if (!media) return null;

  const total =
    anilistType === "ANIME"
      ? media.episodes
      : (media.chapters ?? media.volumes ?? undefined);

  return {
    title: media.title?.english || media.title?.romaji || media.title?.native,
    total,
    source: "AniList",
  };
}

async function lookupMALViaJikan(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  const isAnimeType = mediaType === "Anime" || mediaType === "Donghua";
  const endpoint = isAnimeType ? "anime" : "manga";
  const res = await fetch(
    `https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(title)}&limit=1`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  const first = json?.data?.[0];
  if (!first) return null;

  const total = isAnimeType
    ? (first.episodes ?? undefined)
    : (first.chapters ?? first.volumes ?? undefined);

  return {
    title: first.title_english || first.title || undefined,
    total,
    source: "MAL",
  };
}

async function lookupMediaMeta(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  if (mediaType === "Light Novel") return null;

  try {
    const aniList = await lookupAniList(title, mediaType);
    if (aniList) return aniList;
  } catch {
    // Try fallback source next
  }
  try {
    return await lookupMALViaJikan(title, mediaType);
  } catch {
    return null;
  }
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
  onConfirm: () => void,
  onCancel?: () => void,
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
  newCancel.addEventListener("click", () => {
    dialog.close();
    onCancel?.();
  });

  dialog.showModal();
}

// ── Export System ────────────────────────────────────────────────

function exportJSON() {
  const payload = state.media.map(
    ({
      title,
      media_type,
      status,
      progress_current,
      progress_total,
      rating,
      notes,
      last_updated,
    }) => ({
      title,
      media_type,
      status,
      progress_current,
      progress_total,
      rating: rating ?? null,
      notes: notes ?? "",
      last_updated,
    }),
  );
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `chronicle-export-${dateStamp()}.json`);
  showToast(`Exported ${payload.length} entries as JSON`, "success");
}

function toExportRows(items: MediaItem[]) {
  const headers = [
    "title",
    "media_type",
    "status",
    "progress_current",
    "progress_total",
    "rating",
    "notes",
    "last_updated",
  ] as const;
  const rows = items.map((m) =>
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
      .join(","),
  );
  return { headers: [...headers], rows };
}

function exportCSV(items: MediaItem[] = state.media, filename?: string) {
  const { headers, rows } = toExportRows(items);
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, filename || `chronicle-export-${dateStamp()}.csv`);
  showToast(`Exported ${items.length} entries as CSV`, "success");
}

function exportXLSX(items: MediaItem[], filename: string) {
  const sheetData = items.map((m) => ({
    title: m.title,
    media_type: m.media_type,
    status: m.status,
    progress_current: m.progress_current,
    progress_total: m.progress_total,
    rating: m.rating ?? "",
    notes: m.notes ?? "",
    last_updated: m.last_updated,
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Chronicle");
  XLSX.writeFile(wb, filename);
  showToast(`Exported ${items.length} entries as Excel`, "success");
}

function slugType(mediaType: string): string {
  return mediaType.toLowerCase().replace(/\s+/g, "-");
}

function openExportTypeDialog() {
  const dialog = document.getElementById(
    "export-type-dialog",
  ) as HTMLDialogElement;
  const typeSelect = document.getElementById(
    "export-type-media",
  ) as HTMLSelectElement;
  const formatSelect = document.getElementById(
    "export-type-format",
  ) as HTMLSelectElement;
  const confirmBtn = document.getElementById("export-type-confirm")!;
  const cancelBtn = document.getElementById("export-type-cancel")!;

  const newConfirm = confirmBtn.cloneNode(true) as HTMLElement;
  const newCancel = cancelBtn.cloneNode(true) as HTMLElement;
  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  newCancel.addEventListener("click", () => dialog.close());
  newConfirm.addEventListener("click", () => {
    const mediaType = typeSelect.value;
    const format = formatSelect.value;
    const scoped = state.media.filter((m) => m.media_type === mediaType);

    if (scoped.length === 0) {
      showToast(`No ${mediaType} entries to export.`, "error");
      return;
    }

    const stamp = dateStamp();
    const typeSlug = slugType(mediaType);
    if (format === "csv") {
      exportCSV(scoped, `chronicle-${typeSlug}-${stamp}.csv`);
    } else {
      exportXLSX(scoped, `chronicle-${typeSlug}-${stamp}.xlsx`);
    }
    dialog.close();
  });

  dialog.showModal();
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

function normalizeType(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "anime") return "Anime";
  if (lower === "manhwa") return "Manhwa";
  if (lower === "donghua") return "Donghua";
  if (lower === "light novel" || lower === "ln" || lower === "novel")
    return "Light Novel";
  return value.trim();
}

function normalizeStatus(value: string): string {
  const lower = value.trim().toLowerCase();
  if (
    ["watching", "reading", "watching/reading", "in progress"].includes(lower)
  ) {
    return "Watching/Reading";
  }
  if (["plan to watch", "plan to read", "planned", "plan"].includes(lower)) {
    return "Planned";
  }
  if (["on hold", "paused"].includes(lower)) return "On Hold";
  if (lower === "dropped") return "Dropped";
  if (["completed", "finished", "complete"].includes(lower)) return "Completed";
  return value.trim();
}

function normalizeMALStatus(value: string, bucket: "anime" | "manga"): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const code = Number(raw);

  if (!Number.isNaN(code)) {
    if (code === 1)
      return bucket === "anime" ? "Watching/Reading" : "Watching/Reading";
    if (code === 2) return "Completed";
    if (code === 3) return "On Hold";
    if (code === 4) return "Dropped";
    if (code === 6) return "Planned";
  }

  if (
    [
      "watching",
      "reading",
      "watching/reading",
      "currently reading",
      "currently watching",
    ].includes(raw)
  ) {
    return "Watching/Reading";
  }
  if (["completed", "finished"].includes(raw)) return "Completed";
  if (["on-hold", "on hold", "hold", "paused"].includes(raw)) return "On Hold";
  if (["dropped"].includes(raw)) return "Dropped";
  if (
    ["plan to watch", "plan to read", "planned", "plan", "ptw", "ptr"].includes(
      raw,
    )
  ) {
    return "Planned";
  }
  return "Watching/Reading";
}

function inferMALType(
  row: Record<string, unknown>,
  bucket: "anime" | "manga",
): string {
  if (bucket === "anime") return "Anime";

  const seriesType = String(row.series_type ?? "")
    .trim()
    .toLowerCase();
  if (seriesType.includes("novel")) return "Light Novel";
  if (seriesType.includes("manhwa")) return "Manhwa";
  if (seriesType.includes("manhua")) return "Manhwa";
  return "Manhwa";
}

function looksLikeMALRow(row: Record<string, unknown>): boolean {
  return Boolean(
    row.series_title !== undefined ||
    row.my_status !== undefined ||
    row.my_watched_episodes !== undefined ||
    row.my_read_chapters !== undefined,
  );
}

function toImportRowFromMAL(raw: Record<string, unknown>): ImportRow | null {
  const row = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );

  if (!looksLikeMALRow(row)) return null;

  const bucket: "anime" | "manga" =
    row.my_watched_episodes !== undefined || row.series_episodes !== undefined
      ? "anime"
      : "manga";

  const title = String(row.series_title ?? row.title ?? "").trim();
  if (!title) return null;

  const media_type = inferMALType(row, bucket);
  const status = normalizeMALStatus(String(row.my_status ?? ""), bucket);

  const progress_current =
    bucket === "anime"
      ? Number(row.my_watched_episodes ?? 0)
      : Number(row.my_read_chapters ?? row.my_chapters_read ?? 0);

  const progress_total =
    bucket === "anime"
      ? Number(row.series_episodes ?? 0)
      : Number(row.series_chapters ?? row.series_volumes ?? 0);

  const ratingRaw = row.my_score;
  const rating =
    ratingRaw === undefined || ratingRaw === null
      ? undefined
      : Number(ratingRaw);

  const comments = String(row.my_comments ?? "").trim();
  const tags = String(row.my_tags ?? "").trim();
  const notes = [comments, tags ? `tags: ${tags}` : ""]
    .filter(Boolean)
    .join(" | ");

  const clean: ImportRow = {
    title,
    media_type,
    status,
    progress_current: Number.isFinite(progress_current)
      ? Math.max(0, Math.floor(progress_current))
      : 0,
    progress_total: Number.isFinite(progress_total)
      ? Math.max(0, Math.floor(progress_total))
      : 0,
    notes: notes || undefined,
  };

  if (Number.isFinite(rating!))
    clean.rating = Math.max(0, Math.min(10, Number(rating)));
  return clean;
}

function toImportRow(raw: Record<string, unknown>): ImportRow | null {
  const mal = toImportRowFromMAL(raw);
  if (mal) return mal;

  const row = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase().trim(), v]),
  );
  const title = String(row.title ?? row.name ?? "").trim();
  const media_type = normalizeType(String(row.media_type ?? row.type ?? ""));
  const status = normalizeStatus(String(row.status ?? "Watching/Reading"));
  const progress_current = Number(
    row.progress_current ?? row.current ?? row.progress ?? 0,
  );
  const progress_total = Number(row.progress_total ?? row.total ?? 0);
  const ratingRaw = row.rating ?? row.score;
  const rating =
    ratingRaw === undefined || ratingRaw === null
      ? undefined
      : Number(ratingRaw);
  const notes = String(row.notes ?? row.note ?? "").trim();

  if (!title || !media_type || !status) return null;

  const clean: ImportRow = {
    title,
    media_type,
    status,
    progress_current: Number.isFinite(progress_current)
      ? Math.max(0, Math.floor(progress_current))
      : 0,
    progress_total: Number.isFinite(progress_total)
      ? Math.max(0, Math.floor(progress_total))
      : 0,
    notes: notes || undefined,
  };

  if (Number.isFinite(rating!))
    clean.rating = Math.max(0, Math.min(10, Number(rating)));
  return clean;
}

function parseCSV(text: string): Record<string, unknown>[] {
  const wb = XLSX.read(text, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<
    string,
    unknown
  >[];
}

async function parseImportFile(file: File): Promise<ImportRow[]> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".json")) {
    const text = await file.text();
    const entries = JSON.parse(text);
    if (!Array.isArray(entries)) {
      throw new Error("Invalid JSON format: expected an array");
    }
    return entries
      .map((entry) => toImportRow(entry as Record<string, unknown>))
      .filter(Boolean) as ImportRow[];
  }

  if (lower.endsWith(".csv")) {
    const text = await file.text();
    const rows = parseCSV(text);
    return rows.map(toImportRow).filter(Boolean) as ImportRow[];
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<
      string,
      unknown
    >[];
    return rows.map(toImportRow).filter(Boolean) as ImportRow[];
  }

  throw new Error("Unsupported file type");
}

document
  .getElementById("import-file")
  ?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const entries = await parseImportFile(file);
      if (entries.length === 0) {
        showToast("No valid rows found in file.", "error");
        return;
      }

      let imported = 0;
      let skipped = 0;
      const CHUNK_SIZE = 100;

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        try {
          const res = await apiFetch("/media?bulk=1", {
            method: "POST",
            body: JSON.stringify(chunk),
          });
          imported += Number(res?.inserted || 0);
          skipped += Number(res?.skipped || 0);
        } catch {
          skipped += chunk.length;
        }
      }

      showToast(
        `Imported ${imported} entries${skipped > 0 ? `, ${skipped} skipped` : ""}`,
        imported > 0 ? "success" : "error",
      );

      if (imported > 0) fetchMedia(true);
    } catch (err: any) {
      showToast(err?.message || "Failed to import file.", "error");
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
    let message = "Request failed";
    let code = "";
    try {
      const payload = await res.json();
      message = payload?.message || payload?.code || message;
      code = payload?.code || "";
    } catch {
      const text = await res.text();
      message = text || message;
    }
    const err = new Error(message) as Error & {
      code?: string;
      status?: number;
    };
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchMedia(reset = true) {
  if (reset) {
    state.page = 1;
    state.media = [];
    state.hasMore = false;
    state.loading = true;
    state.loadingMore = false;
    if (!document.getElementById("media-grid")) {
      renderApp();
    } else {
      renderStatsHost();
      renderMediaCards();
    }
  } else {
    state.loadingMore = true;
    renderMediaCards();
  }

  try {
    const query = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
      sort_by: state.sortBy,
    });
    if (state.search.trim()) query.set("search", state.search.trim());
    if (state.filterType) query.set("media_type", state.filterType);
    if (state.filterStatus) query.set("status", state.filterStatus);

    const payload = await apiFetch(`/media?${query.toString()}`);
    const items = Array.isArray(payload) ? payload : payload.items || [];

    if (reset) state.media = items;
    else state.media = [...state.media, ...items];

    state.total = Array.isArray(payload)
      ? items.length
      : payload.total || items.length;
    state.hasMore = Array.isArray(payload) ? false : Boolean(payload.has_more);

    if (!Array.isArray(payload)) {
      state.page = Number(payload.page || state.page);
    }

    const available = new Set(state.media.map((m) => m._id));
    state.selectedIds.forEach((id) => {
      if (!available.has(id)) state.selectedIds.delete(id);
    });
  } catch {
    showToast("Failed to load your entries. Please try again.", "error");
  }

  state.loading = false;
  state.loadingMore = false;
  if (!document.getElementById("media-grid")) {
    renderApp();
    return;
  }
  renderStatsHost();
  renderMediaCards();
}

// ── Stats ────────────────────────────────────────────────────────

function renderStats(): string {
  const total = state.total || state.media.length;
  if (total === 0) return "";

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;

  state.media.forEach((m) => {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byType[m.media_type] = (byType[m.media_type] || 0) + 1;
    if (m.rating) {
      ratingSum += m.rating;
      ratingCount++;
    }
  });

  const avgRating =
    ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";

  const watching = byStatus["Watching/Reading"] || 0;
  const completed = byStatus["Completed"] || 0;
  const planned = byStatus["Planned"] || 0;
  const onHold = byStatus["On Hold"] || 0;
  const dropped = byStatus["Dropped"] || 0;

  // Type breakdown chips
  const typeChips = Object.entries(byType)
    .map(
      ([type, count]) =>
        `<span class="stat-chip"><strong>${count}</strong>&nbsp;${escapeHtml(type)}</span>`,
    )
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
      </div>
    </div>
  `;
}

function renderStatsHost() {
  const host = document.getElementById("stats-host");
  if (host) host.innerHTML = renderStats();
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

  document.getElementById("btn-logout")?.addEventListener("click", logout);
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

  // Export menu toggle
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
  // Close export menu on outside click
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
    searchTimeout = setTimeout(() => {
      state.search = (e.target as HTMLInputElement).value;
      fetchMedia(true);
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
      fetchMedia(true);
    });
  });

  renderMediaCards();

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
        await fetchMedia(true);
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
        await fetchMedia(true);
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
            await fetchMedia(true);
          },
        );
      });
  }
}

// ── Render Media Cards ───────────────────────────────────────────

function renderMediaCards() {
  const container = document.getElementById("media-grid");
  if (!container) return;
  const loadMoreBtn = document.getElementById(
    "btn-load-more",
  ) as HTMLButtonElement | null;

  if (state.loading) {
    container.innerHTML = `<div class="loading" style="grid-column:1/-1"><div class="spinner"></div></div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  const selectedSet = state.selectedIds;

  if (state.media.length === 0) {
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
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  container.innerHTML = state.media
    .map((m) => {
      const pct = m.progress_total
        ? Math.min(
            100,
            Math.round((m.progress_current / m.progress_total) * 100),
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
      const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
      const cachedCover = getCachedCover(m.title);
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
      <div class="card${staleClass}" data-status="${escapeHtml(m.status)}">
        <div class="card-header">
          ${
            state.bulkMode
              ? `<input type="checkbox" class="bulk-select" data-id="${m._id}" ${selectedSet.has(m._id) ? "checked" : ""} aria-label="Select ${escapeHtml(m.title)}">`
              : ""
          }
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

  if (loadMoreBtn) {
    loadMoreBtn.style.display = state.hasMore ? "inline-flex" : "none";
    loadMoreBtn.disabled = state.loadingMore;
    loadMoreBtn.innerHTML = state.loadingMore
      ? `<span class="spinner"></span>`
      : "Load more";
    loadMoreBtn.onclick = async () => {
      if (state.loadingMore || !state.hasMore) return;
      state.page += 1;
      await fetchMedia(false);
    };
  }
}

// ── Modal & Form Logic ───────────────────────────────────────────

function openModal(item?: MediaItem) {
  const modal = document.getElementById("media-modal") as HTMLDialogElement;
  const titleInput = document.getElementById("media-title") as HTMLInputElement;
  const typeInput = document.getElementById("media-type") as HTMLSelectElement;
  const totalInput = document.getElementById(
    "media-progress-total",
  ) as HTMLInputElement;
  const lookupHint = document.getElementById("lookup-hint") as HTMLElement;

  (document.getElementById("modal-title") as HTMLElement).textContent = item
    ? "Edit Entry"
    : "Add Entry";
  (document.getElementById("media-id") as HTMLInputElement).value =
    item?._id || "";
  titleInput.value = item?.title || "";
  typeInput.value = item?.media_type || "Anime";
  (document.getElementById("media-status") as HTMLSelectElement).value =
    item?.status || "Watching/Reading";
  (
    document.getElementById("media-progress-current") as HTMLInputElement
  ).value = item?.progress_current.toString() || "0";
  totalInput.value = item?.progress_total.toString() || "0";
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

  const lookupBtn = document.getElementById(
    "btn-anime-lookup",
  ) as HTMLButtonElement;
  const newLookupBtn = lookupBtn.cloneNode(true) as HTMLButtonElement;
  lookupBtn.replaceWith(newLookupBtn);

  const updateLookupState = () => {
    const type = typeInput.value;
    const allowed = type === "Anime" || type === "Donghua" || type === "Manhwa";
    newLookupBtn.disabled = !allowed;
    lookupHint.textContent = allowed
      ? type === "Anime" || type === "Donghua"
        ? "Lookup uses AniList first, then MAL fallback to auto-fill title and total episodes."
        : "Lookup uses AniList first, then MAL fallback to auto-fill title and chapters/volumes."
      : "Lookup is not available for Light Novel.";
  };

  updateLookupState();
  typeInput.onchange = updateLookupState;

  newLookupBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) {
      showToast("Enter a title before lookup.", "error");
      titleInput.focus();
      return;
    }

    const originalText = newLookupBtn.textContent || "Lookup";
    newLookupBtn.disabled = true;
    newLookupBtn.innerHTML = `<span class="spinner"></span>`;

    const result = await lookupMediaMeta(title, typeInput.value);
    if (!result) {
      showToast("No match found on AniList/MAL.", "error");
      updateLookupState();
      newLookupBtn.textContent = originalText;
      return;
    }

    if (result.title) titleInput.value = result.title;
    if (result.total && Number(totalInput.value || "0") <= 0) {
      totalInput.value = String(result.total);
    }
    showToast(`Filled from ${result.source}`, "success");
    updateLookupState();
    newLookupBtn.textContent = originalText;
  });

  modal.showModal();

  // Focus the title input after modal opens
  setTimeout(() => {
    titleInput?.focus();
  }, 50);
}

document.getElementById("media-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = (document.getElementById("media-id") as HTMLInputElement).value;
  const saveBtn = (e.target as HTMLFormElement).querySelector(
    ".btn-primary",
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
      10,
    ),
    progress_total: parseInt(
      (document.getElementById("media-progress-total") as HTMLInputElement)
        .value,
      10,
    ),
    rating:
      parseInt(
        (document.getElementById("media-rating") as HTMLInputElement).value,
        10,
      ) || undefined,
    notes: (document.getElementById("media-notes") as HTMLTextAreaElement)
      .value,
  };

  if (data.progress_total > 0 && data.progress_current > data.progress_total) {
    showToast("Current progress cannot exceed total.", "error");
    return;
  }

  // Loading state on save button
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span class="spinner"></span>`;

  const createEntry = async (mode?: "merge" | "keep_both") => {
    const endpoint = mode ? `/media?duplicate_mode=${mode}` : "/media";
    return apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
  };

  try {
    if (id) {
      await apiFetch(`/media?id=${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      try {
        await createEntry();
      } catch (err: any) {
        if (err?.code === "DUPLICATE_TITLE") {
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
          showConfirm(
            "Duplicate found",
            "A similar title exists for this type. Merge into existing entry or keep both?",
            async () => {
              try {
                await createEntry("merge");
                (
                  document.getElementById("media-modal") as HTMLDialogElement
                ).close();
                showToast("Entry merged", "success");
                fetchMedia(true);
              } catch {
                showToast("Failed to merge duplicate entry.", "error");
              }
            },
            async () => {
              try {
                await createEntry("keep_both");
                (
                  document.getElementById("media-modal") as HTMLDialogElement
                ).close();
                showToast("Entry added (kept both)", "success");
                fetchMedia(true);
              } catch {
                showToast("Failed to save duplicate entry.", "error");
              }
            },
          );
          return;
        }
        throw err;
      }
    }
    (document.getElementById("media-modal") as HTMLDialogElement).close();
    showToast(id ? "Entry updated" : "Entry added", "success");
    fetchMedia(true);
  } catch {
    showToast("Failed to save. Please try again.", "error");
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

// ── Event Delegation for Card Buttons ────────────────────────────

document.addEventListener("change", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("bulk-select")) return;
  const checkbox = target as HTMLInputElement;
  const id = checkbox.getAttribute("data-id");
  if (!id) return;
  if (checkbox.checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  const countEl = document.querySelector(".bulk-count");
  if (countEl) countEl.textContent = `${state.selectedIds.size} selected`;
});

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
      },
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
        state.page = 1;
        await fetchMedia(true);
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
  state.total = 0;
  state.page = 1;
  state.hasMore = false;
  state.loading = false;
  state.loadingMore = false;
  state.search = "";
  state.filterType = "";
  state.filterStatus = "";
  state.sortBy = "last_updated";
  renderApp();
}

async function init() {
  loadCoverCache();
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
