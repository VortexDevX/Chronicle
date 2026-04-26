import { store } from "../../state/store.js";
import { openModal } from "./modal.js";
import { updateMedia, deleteMedia } from "../../services/media.js";
import { showToast } from "../../ui/toast.js";
import { showConfirm } from "../../ui/modals.js";

function updateBulkSelectedCount(): void {
  const countEl = document.querySelector(".bulk-count");
  if (countEl) {
    countEl.textContent = `${store.get().selectedIds.size} selected`;
  }
}

function toggleCardActionsOnMobile(target: HTMLElement): void {
  const card = target.closest(".card") as HTMLElement | null;
  if (
    !card ||
    target.closest(".card-actions") ||
    target.closest(".bulk-select") ||
    target.closest(".btn-increment")
  ) {
    return;
  }

  if (window.innerWidth <= 768) {
    document.querySelectorAll(".card.card-actions-visible").forEach((c) => {
      if (c !== card) c.classList.remove("card-actions-visible");
    });
    card.classList.toggle("card-actions-visible");
  }
}

async function handleDelete(id: string): Promise<void> {
  const item = store.get().media.find((m) => m._id === id);
  const title = item ? item.title : "this entry";
  showConfirm(
    "Delete entry?",
    `"${title}" will be permanently removed.`,
    async () => {
      try {
        await deleteMedia(id);
        showToast("Entry deleted", "success");
      } catch {
        showToast("Failed to delete. Please try again.", "error");
      }
    },
  );
}

async function handleIncrement(id: string): Promise<void> {
  const itemIndex = store.get().media.findIndex((m) => m._id === id);
  if (itemIndex === -1) return;

  const oldProgress = store.get().media[itemIndex].progress_current;

  // Optimistic update
  store.set((prev) => ({
    ...prev,
    media: prev.media.map((m, i) =>
      i === itemIndex ? { ...m, progress_current: m.progress_current + 1 } : m,
    ),
  }));

  try {
    await updateMedia(id, { progress_current: oldProgress + 1 });
  } catch {
    // Revert
    store.set((prev) => ({
      ...prev,
      media: prev.media.map((m, i) =>
        i === itemIndex ? { ...m, progress_current: oldProgress } : m,
      ),
    }));
    showToast("Failed to update progress.", "error");
  }
}

export function setupCardEventDelegation(): void {
  document.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("bulk-select")) return;
    const checkbox = target as HTMLInputElement;
    const id = checkbox.getAttribute("data-id");
    if (!id) return;

    store.updateSelectedIds((set) => {
      if (checkbox.checked) set.add(id);
      else set.delete(id);
    });
    updateBulkSelectedCount();
  });

  document.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    toggleCardActionsOnMobile(target);

    const id = target.getAttribute("data-id");
    if (!id) return;

    if (target.classList.contains("btn-edit")) {
      const item = store.get().media.find((m) => m._id === id);
      if (item) openModal(item);
    } else if (target.classList.contains("btn-delete")) {
      await handleDelete(id);
    } else if (target.classList.contains("btn-increment")) {
      await handleIncrement(id);
    }
  });
}
