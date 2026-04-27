/** Media add/edit modal logic – Phase 3 (uses service + store) */
import type { MediaItem } from "../../types/media.js";
import { showToast } from "../../ui/toast.js";
import { showConfirm } from "../../ui/modals.js";
import { lookupMediaMeta } from "../lookup/index.js";
import {
  createMedia,
  updateMedia,
  upsertLocalMediaItem,
} from "../../services/media.js";

type ApiLikeError = { code?: string };

function isApiLikeError(value: unknown): value is ApiLikeError {
  if (!value || typeof value !== "object") return false;
  return "code" in value;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRequiredNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function openModal(item?: MediaItem): void {
  const modal = document.getElementById("media-modal") as HTMLDialogElement;
  const titleInput = document.getElementById("media-title") as HTMLInputElement;
  const typeInput = document.getElementById("media-type") as HTMLSelectElement;
  const totalInput = document.getElementById(
    "media-progress-total",
  ) as HTMLInputElement;
  const readUrlInput = document.getElementById(
    "media-read-url",
  ) as HTMLInputElement | null;
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

  if (readUrlInput) readUrlInput.value = item?.read_url || "";

  const trackerUrlInput = document.getElementById(
    "media-tracker-url",
  ) as HTMLInputElement | null;
  if (trackerUrlInput) trackerUrlInput.value = item?.tracker_url || "";

  const mangadexIdInput = document.getElementById(
    "media-mangadex-id",
  ) as HTMLInputElement | null;
  if (mangadexIdInput) mangadexIdInput.value = item?.mangadex_id || "";

  const customCoverUrlInput = document.getElementById(
    "media-custom-cover-url",
  ) as HTMLInputElement | null;
  if (customCoverUrlInput)
    customCoverUrlInput.value = item?.custom_cover_url || "";

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
  setTimeout(() => titleInput?.focus(), 50);
}

export function setupMediaFormHandler(): void {
  document
    .getElementById("media-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = (document.getElementById("media-id") as HTMLInputElement)
        .value;
      const saveBtn = (e.target as HTMLFormElement).querySelector(
        ".btn-primary",
      ) as HTMLButtonElement;

      const data: Record<string, unknown> = {
        title: (document.getElementById("media-title") as HTMLInputElement)
          .value,
        media_type: (document.getElementById("media-type") as HTMLSelectElement)
          .value,
        status: (document.getElementById("media-status") as HTMLSelectElement)
          .value,
        progress_current: parseRequiredNumber(
          (
            document.getElementById(
              "media-progress-current",
            ) as HTMLInputElement
          ).value,
        ),
        progress_total: parseRequiredNumber(
          (document.getElementById("media-progress-total") as HTMLInputElement)
            .value,
        ),
        rating: parseOptionalNumber(
          (document.getElementById("media-rating") as HTMLInputElement).value,
        ),
        notes: (document.getElementById("media-notes") as HTMLTextAreaElement)
          .value,
      };

      const readUrlInput = document.getElementById(
        "media-read-url",
      ) as HTMLInputElement | null;
      if (readUrlInput && readUrlInput.value.trim())
        data.read_url = readUrlInput.value.trim();

      const trackerUrlInput = document.getElementById(
        "media-tracker-url",
      ) as HTMLInputElement | null;
      if (trackerUrlInput && trackerUrlInput.value.trim())
        data.tracker_url = trackerUrlInput.value.trim();

      const mangadexIdInput = document.getElementById(
        "media-mangadex-id",
      ) as HTMLInputElement | null;
      if (mangadexIdInput && mangadexIdInput.value.trim())
        data.mangadex_id = mangadexIdInput.value.trim();

      const customCoverUrlInput = document.getElementById(
        "media-custom-cover-url",
      ) as HTMLInputElement | null;
      if (customCoverUrlInput && customCoverUrlInput.value.trim())
        data.custom_cover_url = customCoverUrlInput.value.trim();

      if (
        (data.progress_total as number) > 0 &&
        (data.progress_current as number) > (data.progress_total as number)
      ) {
        showToast("Current progress cannot exceed total.", "error");
        return;
      }

      const originalText = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner"></span>`;

      const createEntry = async (mode?: "merge" | "keep_both") =>
        createMedia(data, mode);

      try {
        if (id) {
          const updated = await updateMedia(id, data, false);
          upsertLocalMediaItem(updated);
        } else {
          try {
            const created = await createEntry();
            upsertLocalMediaItem(created);
          } catch (err) {
            if (isApiLikeError(err) && err.code === "DUPLICATE_TITLE") {
              saveBtn.disabled = false;
              saveBtn.textContent = originalText;
              showConfirm(
                "Duplicate found",
                "A similar title exists for this type. Merge into existing entry or keep both?",
                async () => {
                  try {
                    const merged = await createEntry("merge");
                    upsertLocalMediaItem(merged);
                    (
                      document.getElementById("media-modal") as HTMLDialogElement
                    ).close();
                    showToast("Entry added", "success");
                  } catch (mergeErr) {
                    showToast(
                      getErrorMessage(mergeErr, "Failed to merge entry."),
                      "error",
                    );
                  }
                },
                async () => {
                  try {
                    const created = await createEntry("keep_both");
                    upsertLocalMediaItem(created);
                    (
                      document.getElementById("media-modal") as HTMLDialogElement
                    ).close();
                    showToast("Entry added", "success");
                  } catch (createErr) {
                    showToast(
                      getErrorMessage(createErr, "Failed to add entry."),
                      "error",
                    );
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
      } catch (err) {
        showToast(getErrorMessage(err, "Failed to save. Please try again."), "error");
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });
}
