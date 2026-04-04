/** Import/export normalization for media data. */

import type { ImportRow } from "../types/media.js";

export function normalizeType(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "anime") return "Anime";
  if (lower === "manhwa") return "Manhwa";
  if (lower === "donghua") return "Donghua";
  if (lower === "light novel" || lower === "ln" || lower === "novel")
    return "Light Novel";
  return value.trim();
}

export function normalizeStatus(value: string): string {
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

export function normalizeMALStatus(
  value: string,
  bucket: "anime" | "manga",
): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const code = Number(raw);

  if (!Number.isNaN(code)) {
    if (code === 1) return "Watching/Reading";
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

export function inferMALType(
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

export function looksLikeMALRow(row: Record<string, unknown>): boolean {
  return Boolean(
    row.series_title !== undefined ||
      row.my_status !== undefined ||
      row.my_watched_episodes !== undefined ||
      row.my_read_chapters !== undefined,
  );
}

export function toImportRowFromMAL(
  raw: Record<string, unknown>,
): ImportRow | null {
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

export function toImportRow(raw: Record<string, unknown>): ImportRow | null {
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
