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

function setSettingsFormLoading(loading: boolean): void {
  const inputId = document.getElementById(
    "settings-telegram-id",
  ) as HTMLInputElement | null;
  const inputNotifications = document.getElementById(
    "settings-notifications",
  ) as HTMLInputElement | null;
  const btnSave = document.getElementById(
    "settings-save",
  ) as HTMLButtonElement | null;

  if (inputId) {
    inputId.disabled = loading;
    inputId.placeholder = loading ? "Loading settings..." : "Enter your numeric chat ID";
  }
  if (inputNotifications) inputNotifications.disabled = loading;
  if (btnSave) {
    btnSave.disabled = loading;
    btnSave.innerHTML = loading
      ? `<span class="spinner"></span> Loading...`
      : "Save changes";
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
    btnSave.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
      const payload = {
        telegram_chat_id: inputId.value.trim(),
        notifications_enabled: inputNotifications.checked,
      };

      await apiFetch("/user/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Settings saved successfully", "success");
      modal.close();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save settings";
      showToast(message, "error");
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
    inputId.value = "";
    inputNotifications.checked = false;
    syncNotificationState(inputNotifications, notificationState);
    setSettingsFormLoading(true);
    modal.showModal();

    try {
      const data = (await apiFetch("/user/settings")) as {
        telegram_chat_id?: string;
        notifications_enabled?: boolean;
      };
      inputId.value = data.telegram_chat_id || "";
      inputNotifications.checked = !!data.notifications_enabled;
      syncNotificationState(inputNotifications, notificationState);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load settings";
      showToast(message, "error");
    } finally {
      setSettingsFormLoading(false);
    }
  });
}
