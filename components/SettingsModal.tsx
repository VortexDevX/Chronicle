"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Download,
  LogOut,
  MailCheck,
  Send,
  Share,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import {
  downloadMediaBackup,
  importMediaBackup,
} from "@/lib/client/backup";
import { useMediaStore } from "@/store/mediaStore";
import { useFeedback } from "@/components/FeedbackProvider";

interface SettingsModalProps {
  onClose: () => void;
}

type ChronicleNativeBridge = {
  requestNotificationPermission?: () => void;
  syncPushRegistration?: () => void;
};

type PushDeviceStatus = {
  registered: boolean;
  deviceCount: number;
};

type PushTestResult = {
  sent: number;
  failed: number;
  devices: number;
};

function getChronicleNativeBridge(): ChronicleNativeBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { ChronicleNative?: ChronicleNativeBridge })
    .ChronicleNative;
}

function SettingsToggle({
  name,
  checked,
  title,
  description,
  onChange,
}: {
  name: "notifications_enabled" | "push_notifications_enabled";
  checked: boolean;
  title: string;
  description: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="settings-toggle" data-checked={checked ? "true" : "false"}>
      <input type="checkbox" name={name} checked={checked} onChange={onChange} />
      <span className="settings-toggle-track" aria-hidden="true">
        <span className="settings-toggle-thumb" />
      </span>
      <span className="settings-toggle-text">
        <span className="settings-toggle-header">
          <span className="settings-toggle-copy">{title}</span>
          <span className="settings-toggle-state" data-state={checked ? "on" : "off"}>
            {checked ? "On" : "Off"}
          </span>
        </span>
        <span className="settings-toggle-description">{description}</span>
      </span>
    </label>
  );
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const router = useRouter();
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const setAuth = useMediaStore((state) => state.setAuth);
  const { toast } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showInstall, hasNativePrompt, isInstalled, platform, install: installPwa } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    email_verified_at: null as string | null,
    notifications_enabled: false,
    push_notifications_enabled: false,
    telegram_chat_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [sendingPushTest, setSendingPushTest] = useState(false);
  const [dataAction, setDataAction] = useState<"import" | "export" | "logout" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setFormData({
            email: json.data.email || "",
            email_verified_at: json.data.email_verified_at || null,
            notifications_enabled: json.data.notifications_enabled || false,
            push_notifications_enabled:
              json.data.push_notifications_enabled || false,
            telegram_chat_id: json.data.telegram_chat_id || "",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile settings");
        setLoading(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    if (name === "push_notifications_enabled" && checked) {
      getChronicleNativeBridge()?.requestNotificationPermission?.();
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "email" ? { email_verified_at: null } : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload: Partial<typeof formData> = { ...formData };
      delete payload.email_verified_at;

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to save settings");
      }

      const data = await res.json();
      if (data.data) {
        setFormData((prev) => ({
          ...prev,
          email: data.data.email || "",
          email_verified_at: data.data.email_verified_at || null,
          notifications_enabled: data.data.notifications_enabled || false,
          push_notifications_enabled:
            data.data.push_notifications_enabled || false,
          telegram_chat_id: data.data.telegram_chat_id || "",
        }));
      }
      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerification = async () => {
    if (!formData.email || formData.email_verified_at || sendingVerification) {
      return;
    }

    setSendingVerification(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to send verification email");
      }
      setSuccess(data.data?.message || "Verification email sent");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSendingVerification(false);
    }
  };

  const handlePushTest = async () => {
    if (!formData.push_notifications_enabled || sendingPushTest) return;

    setSendingPushTest(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push_notifications_enabled: true }),
      });

      const nativeBridge = getChronicleNativeBridge();
      nativeBridge?.requestNotificationPermission?.();
      nativeBridge?.syncPushRegistration?.();

      let status: PushDeviceStatus | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        status = await apiRequest<PushDeviceStatus>("/api/push/devices", {
          cache: "no-store",
        });
        if (status.registered) break;
        if (!nativeBridge) break;
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        if (attempt === 3) nativeBridge.syncPushRegistration?.();
      }

      if (!status?.registered) {
        throw new Error(
          "No Android device is registered yet. Allow notifications, then try again.",
        );
      }

      const result = await apiRequest<PushTestResult>("/api/push/test", {
        method: "POST",
      });
      const message = `Test notification sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`;
      setSuccess(message);
      toast(message, "success");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(getErrorMessage(err, "Could not send the test notification"));
    } finally {
      setSendingPushTest(false);
    }
  };

  const handleExport = async () => {
    if (dataAction) return;
    setDataAction("export");
    try {
      const count = await downloadMediaBackup();
      toast(`Exported ${count} entries`, "success");
    } catch (err) {
      toast(getErrorMessage(err, "Export failed"), "error");
    } finally {
      setDataAction(null);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file || dataAction) return;
    setDataAction("import");
    try {
      const result = await importMediaBackup(file);
      refreshMedia();
      toast(
        `Imported ${result.inserted} entries · skipped ${result.skipped}`,
        "success",
      );
    } catch (err) {
      toast(getErrorMessage(err, "Import failed"), "error");
    } finally {
      setDataAction(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogout = async () => {
    if (dataAction) return;
    setDataAction("logout");
    try {
      await apiRequest("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setAuth("unauthenticated");
      onClose();
      router.push("/login");
    } catch (err) {
      toast(getErrorMessage(err, "Logout failed"), "error");
      setDataAction(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saving, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal settings-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close settings">
          <X size={24} />
        </button>
        <div className="modal-header">Settings</div>
        
        {loading ? (
          <div className="loading-state" style={{ padding: "40px" }}><span className="spinner" /></div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <div className="modal-scroll">
              <div className="modal-section-label">Account</div>
              <div className="form-grid full">
                <div className="form-group">
                  <label>Recovery Email</label>
                  <input
                    className="form-input"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter recovery email"
                    maxLength={254}
                  />
                  <div className="settings-email-row">
                    <span
                      className="settings-email-status"
                      data-state={formData.email_verified_at ? "verified" : "unverified"}
                    >
                      <MailCheck size={14} />
                      {formData.email_verified_at ? "Verified" : "Unverified"}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost settings-inline-btn"
                      onClick={handleSendVerification}
                      disabled={
                        !formData.email ||
                        Boolean(formData.email_verified_at) ||
                        sendingVerification ||
                        saving
                      }
                    >
                      {sendingVerification ? <span className="spinner" /> : <Send size={14} />}
                      Send link
                    </button>
                  </div>
                </div>
              </div>

              <div className="modal-section-label">Notifications</div>
              <div className="form-grid full">
                <SettingsToggle
                  name="push_notifications_enabled"
                  checked={formData.push_notifications_enabled}
                  title="Android push notifications"
                  description="Receive new release alerts. Turning this on asks Android for permission."
                  onChange={handleChange}
                />
                <div className="settings-push-test">
                  <span className="settings-push-test-icon" aria-hidden="true">
                    <Smartphone size={18} />
                  </span>
                  <span>
                    <strong>Check Android delivery</strong>
                    <small>Sends one real Firebase notification to your registered phone.</small>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost settings-inline-btn"
                    onClick={handlePushTest}
                    disabled={
                      !formData.push_notifications_enabled ||
                      sendingPushTest ||
                      saving
                    }
                  >
                    {sendingPushTest ? <span className="spinner" /> : <Send size={14} />}
                    {sendingPushTest ? "Testing" : "Send test"}
                  </button>
                </div>
                <SettingsToggle
                  name="notifications_enabled"
                  checked={formData.notifications_enabled}
                  title="Telegram notifications"
                  description="Receive chapter and episode updates in Telegram."
                  onChange={handleChange}
                />
                <div className="form-group">
                  <label>Telegram Chat ID</label>
                  <input
                    className="form-input"
                    name="telegram_chat_id"
                    value={formData.telegram_chat_id}
                    onChange={handleChange}
                    placeholder="Enter Telegram chat ID"
                  />
                </div>
              </div>

              <div className="modal-section-label">Data and session</div>
              <div className="settings-data-grid">
                {showInstall && (
                  <button
                    type="button"
                    className="pwa-install-card"
                    onClick={async () => {
                      if (hasNativePrompt) {
                        const ok = await installPwa();
                        if (ok) toast("Chronicle installed!", "success");
                      } else if (platform === "ios") {
                        setShowIosGuide((v) => !v);
                      } else {
                        toast("Use your browser's menu → Install app", "info");
                      }
                    }}
                  >
                    <span>{platform === "ios" ? <Share size={18} /> : <Smartphone size={18} />}</span>
                    <strong>Install Chronicle</strong>
                    <small>
                      {platform === "ios"
                        ? "Add to Home Screen for a native app feel."
                        : "Add to your home screen for instant access."}
                    </small>
                  </button>
                )}
                {showInstall && showIosGuide && platform === "ios" && (
                  <div className="pwa-ios-guide">
                    <span>1. Tap <Share size={14} /> <strong>Share</strong> in Safari&apos;s toolbar</span>
                    <span>2. Scroll down and tap <strong>Add to Home Screen</strong></span>
                    <span>3. Tap <strong>Add</strong> — done!</span>
                  </div>
                )}
                {isInstalled && (
                  <div className="pwa-installed-badge">
                    <Smartphone size={15} />
                    <span>Chronicle is installed</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={Boolean(dataAction)}
                >
                  <span><Upload size={18} /></span>
                  <strong>Export library</strong>
                  <small>Download every Chronicle entry as JSON.</small>
                  {dataAction === "export" && <i className="spinner" />}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={Boolean(dataAction)}
                >
                  <span><Download size={18} /></span>
                  <strong>Import library</strong>
                  <small>Restore compatible Chronicle JSON without duplicates.</small>
                  {dataAction === "import" && <i className="spinner" />}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={Boolean(dataAction)}
                >
                  <span><LogOut size={18} /></span>
                  <strong>Sign out</strong>
                  <small>End this browser session securely.</small>
                  {dataAction === "logout" && <i className="spinner" />}
                </button>
              </div>
              <div className="settings-data-note">
                <Database size={15} />
                <span>Media stays in your MongoDB account. Import keeps existing duplicate protection.</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => handleImport(event.target.files?.[0])}
              />

              {error && <div className="auth-error">{error}</div>}
              {success && <div className="auth-success">{success}</div>}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Close</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
