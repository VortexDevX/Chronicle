import { fetchAllMediaForExport } from "@/lib/services/media/exportMedia";
import { apiRequest } from "@/lib/client/api";

const IMPORT_CHUNK_SIZE = 200;

function stripImportMetadata(item: Record<string, unknown>) {
  const clean = { ...item };
  delete clean._id;
  delete clean.user_id;
  delete clean.created_at;
  delete clean.linked_entries_data;
  delete clean.last_checked_at;
  delete clean.last_scrape_status;
  delete clean.last_scrape_error;
  delete clean.latest_remote_progress;
  delete clean.last_notified_progress;
  return clean;
}

export async function downloadMediaBackup() {
  const items = await fetchAllMediaForExport();
  const blob = new Blob([JSON.stringify(items, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chronicle-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  return items.length;
}

export async function importMediaBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Backup must contain a media array.");

  const items = parsed
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map(stripImportMetadata);

  let inserted = 0;
  let skipped = 0;
  const hosted = items.filter(item => typeof item.hosted_novel_slug === "string");
  for (const item of hosted) {
    const slug = String(item.hosted_novel_slug);
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) { skipped++; continue; }
    const novel = await apiRequest<{ library: unknown }>(`/api/novels/${slug}`);
    if (novel.library) { skipped++; continue; }
    const entry = await apiRequest<{ _id: string }>(`/api/novels/${slug}/library`, { method: "POST" });
    const values = Object.fromEntries(["status", "progress_current", "rating", "notes"].filter(key => item[key] !== undefined).map(key => [key,item[key]]));
    await apiRequest(`/api/media?id=${entry._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (typeof item.is_favorite === "boolean") await apiRequest(`/api/novels/${slug}/library`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_favorite: item.is_favorite }) });
    inserted++;
  }
  const tracked = items.filter(item => typeof item.hosted_novel_slug !== "string");
  for (let index = 0; index < tracked.length; index += IMPORT_CHUNK_SIZE) {
    const result = await apiRequest<{ inserted?: number; skipped?: number }>(
      "/api/media?bulk=1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tracked.slice(index, index + IMPORT_CHUNK_SIZE)),
      },
    );
    inserted += Number(result.inserted || 0);
    skipped += Number(result.skipped || 0);
  }

  return { inserted, skipped };
}
