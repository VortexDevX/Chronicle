import { store } from "../state/store.js";
import { fetchMedia } from "../services/media.js";
import { apiFetch } from "../api/client.js";
import { showToast } from "../ui/toast.js";

// Extracts business logic from UI layer into feature orchestration (Phase 2)

export function toggleBulkMode(): void {
  store.set((prev) => ({
    ...prev,
    bulkMode: !prev.bulkMode,
    selectedIds: !prev.bulkMode ? prev.selectedIds : new Set<string>(),
  }));
}

export function selectAllLoaded(): void {
  store.updateSelectedIds((set) => {
    store.get().media.forEach((m) => set.add(m._id));
  });
}

export function clearSelection(): void {
  store.updateSelectedIds((set) => set.clear());
}

export async function submitBulkStatus(status: string): Promise<void> {
  const ids = Array.from(store.get().selectedIds);
  if (ids.length === 0) return showToast("No entries selected.", "error");

  const updates = await Promise.allSettled(
    ids.map((id) =>
      apiFetch(`/media?id=${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      })
    )
  );

  const ok = updates.filter((r) => r.status === "fulfilled").length;
  const fail = updates.length - ok;
  showToast(
    `Updated ${ok} entries${fail ? `, ${fail} failed` : ""}`,
    ok > 0 ? "success" : "error"
  );

  store.set((prev) => ({
    ...prev,
    selectedIds: new Set<string>(),
    bulkMode: false,
  }));
  await fetchMedia(true, true);
}

export async function submitBulkIncrement(): Promise<void> {
  const state = store.get();
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
    })
  );

  const ok = updates.filter((r) => r.status === "fulfilled").length;
  const fail = updates.length - ok;
  showToast(
    `Incremented ${ok} entries${fail ? `, ${fail} failed` : ""}`,
    ok > 0 ? "success" : "error"
  );

  store.set((prev) => ({
    ...prev,
    selectedIds: new Set<string>(),
    bulkMode: false,
  }));
  await fetchMedia(true, true);
}

export async function submitBulkDelete(): Promise<boolean> {
  const ids = Array.from(store.get().selectedIds);
  if (ids.length === 0) {
    showToast("No entries selected.", "error");
    return false;
  }
  
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
      fail += Math.max(
        0,
        Number(res?.requested || chunk.length) - Number(res?.deleted || 0)
      );
    } catch {
      fail += chunk.length;
    }
  }

  showToast(
    `Deleted ${ok} entries${fail ? `, ${fail} failed` : ""}`,
    ok > 0 ? "success" : "error"
  );

  store.set((prev) => ({
    ...prev,
    selectedIds: new Set<string>(),
    bulkMode: false,
  }));
  await fetchMedia(true, true);
  return true;
}

export function setSearchTerm(term: string): void {
  store.set((prev) => ({ ...prev, search: term }));
  void fetchMedia(true);
}

export function setFilterSort(
  key: "filterType" | "filterStatus" | "sortBy",
  value: string
): void {
  store.set((prev) => ({ ...prev, [key]: value }));
  void fetchMedia(true);
}
