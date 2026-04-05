/** Import/Export feature module. */

import ExcelJS from "exceljs";
import type { MediaItem, ImportRow } from "../../types/media.js";
import { toImportRow } from "../../utils/validation.js";
import { downloadBlob } from "../../utils/dom.js";
import { dateStamp, slugType } from "../../utils/format.js";
import { showToast } from "../../ui/toast.js";
import { state } from "../../state/store.js";
import { apiFetch } from "../../api/client.js";
import { fetchMedia } from "../../api/media.js";
import { renderStatsHost } from "../media/stats.js";
import { renderMediaCards } from "../media/cards.js";

// ── Export ──────────────────────────────────────────────────────────

export function exportJSON(): void {
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
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(","),
  );
  return { headers: [...headers], rows };
}

export function exportCSV(
  items: MediaItem[] = state.media,
  filename?: string,
): void {
  const { headers, rows } = toExportRows(items);
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, filename || `chronicle-export-${dateStamp()}.csv`);
  showToast(`Exported ${items.length} entries as CSV`, "success");
}

export async function exportXLSX(
  items: MediaItem[],
  filename: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Chronicle");

  sheet.columns = [
    { header: "title", key: "title", width: 40 },
    { header: "media_type", key: "media_type", width: 15 },
    { header: "status", key: "status", width: 18 },
    { header: "progress_current", key: "progress_current", width: 18 },
    { header: "progress_total", key: "progress_total", width: 15 },
    { header: "rating", key: "rating", width: 10 },
    { header: "notes", key: "notes", width: 40 },
    { header: "last_updated", key: "last_updated", width: 22 },
  ];

  for (const m of items) {
    sheet.addRow({
      title: m.title,
      media_type: m.media_type,
      status: m.status,
      progress_current: m.progress_current,
      progress_total: m.progress_total,
      rating: m.rating ?? "",
      notes: m.notes ?? "",
      last_updated: m.last_updated,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
  showToast(`Exported ${items.length} entries as Excel`, "success");
}

export function openExportTypeDialog(): void {
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
  newConfirm.addEventListener("click", async () => {
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
      await exportXLSX(scoped, `chronicle-${typeSlug}-${stamp}.xlsx`);
    }
    dialog.close();
  });

  dialog.showModal();
}

// ── Import ─────────────────────────────────────────────────────────

function parseCSVWithExcel(text: string): Record<string, unknown>[] {
  // Simple CSV parsing — split by lines and parse headers
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
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
    const rows = parseCSVWithExcel(text);
    return rows.map(toImportRow).filter(Boolean) as ImportRow[];
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("No worksheet found in file");

    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headers.push(String(cell.value || "").trim());
        });
      } else {
        const rowObj: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) rowObj[header] = cell.value;
        });
        rows.push(rowObj);
      }
    });

    return rows.map(toImportRow).filter(Boolean) as ImportRow[];
  }

  throw new Error("Unsupported file type");
}

export function setupImportHandler(): void {
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

        if (imported > 0) {
          await fetchMedia(true, true);
          renderStatsHost();
          renderMediaCards();
        }
      } catch (err: any) {
        showToast(err?.message || "Failed to import file.", "error");
      }
    });
}

export function triggerImport(): void {
  const fileInput = document.getElementById("import-file") as HTMLInputElement;
  fileInput.value = "";
  fileInput.click();
}
