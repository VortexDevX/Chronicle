/** Settings feature – Phase 3 */
import { apiFetch } from "../api/client.js";
import { showToast } from "../ui/toast.js";

function syncNotificationState(
  input: HTMLInputElement | null,
  badge: HTMLSpanElement | null,
) {
  const enabled = !!input?.checked;
  if (badge) {
    badge.textContent = enabled ? "On" : "Off";
    badge.dataset.state = enabled ? "on" : "off";
  }
}

export function setupSettingsGlobalHandlers() {
  const modal = document.getElementById("settings-modal") as HTMLDialogElement;
  const form = document.getElementById("settings-form") as HTMLFormElement;
  const inputId = document.getElementById(
    "settings-telegram-id",
  ) as HTMLInputElement;
  const inputNotifications = document.getElementById(
    "settings-notifications",
  ) as HTMLInputElement;
  const notificationState = document.getElementById(
    "settings-notifications-state",
  ) as HTMLSpanElement | null;
  const btnSave = document.getElementById("settings-save") as HTMLButtonElement;

  if (!modal || !form) return;

  inputNotifications?.addEventListener("change", () =>
    syncNotificationState(inputNotifications, notificationState),
  );
  syncNotificationState(inputNotifications, notificationState);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btnSave.disabled) return;

    btnSave.disabled = true;
    btnSave.textContent = "Saving...";

    try {
      const payload = {
        telegram_chat_id: inputId.value.trim(),
        notifications_enabled: inputNotifications.checked,
      };

      const { ok, message } = await apiFetch("/user/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (ok) {
        showToast("Settings saved successfully", "success");
        modal.close();
      } else {
        showToast(message || "Failed to save settings", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to save settings", "error");
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = "Save changes";
    }
  });
}

export function attachSettingsButtonListener() {
  const btnSettings = document.getElementById("btn-settings");
  const modal = document.getElementById("settings-modal") as HTMLDialogElement;

  if (!btnSettings || !modal) return;

  btnSettings.addEventListener("click", async () => {
    const inputId = document.getElementById(
      "settings-telegram-id",
    ) as HTMLInputElement;
    const inputNotifications = document.getElementById(
      "settings-notifications",
    ) as HTMLInputElement;
    const notificationState = document.getElementById(
      "settings-notifications-state",
    ) as HTMLSpanElement | null;
    const btnSave = document.getElementById(
      "settings-save",
    ) as HTMLButtonElement;

    modal.showModal(); // Show immediately!
    btnSave.disabled = true;

    try {
      const { ok, data, message } = await apiFetch("/user/settings");
      if (ok && data) {
        inputId.value = data.telegram_chat_id || "";
        inputNotifications.checked = !!data.notifications_enabled;
        syncNotificationState(inputNotifications, notificationState);
      } else {
        showToast(message || "Failed to load settings", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to load settings", "error");
    } finally {
      btnSave.disabled = false;
    }
  });
}
