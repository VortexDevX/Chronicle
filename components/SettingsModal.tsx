"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Database,
  Download,
  LogOut,
  MailCheck,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Upload,
  User,
  X,
  Sliders,
} from "lucide-react";
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
            {checked ? "Active" : "Disabled"}
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
  const { toast, confirm } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAdvancedPush, setShowAdvancedPush] = useState(false);

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
    const ok = await confirm({
      title: "Sign out?",
      message: "Are you sure you want to end your session?",
      confirmLabel: "Sign out",
      danger: true,
    });
    if (!ok) return;

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
    <div className="modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close settings"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>

        <div className="modal-header settings-modal-header" id="settings-modal-title">
          <div className="settings-modal-title-group">
            <span className="settings-header-icon">
              <Sliders size={18} />
            </span>
            <div>
              <h2>Settings</h2>
              <p>Account, notifications, mobile app, and data management.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: "48px 24px" }}>
            <span className="spinner" />
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <div className="modal-scroll settings-modal-body">
              {/* Account Section */}
              <div className="settings-section">
                <div className="modal-section-header">
                  <User size={15} />
                  <span>Account &amp; Security</span>
                </div>
                <div className="form-grid full">
                  <div className="form-group">
                    <label htmlFor="settings-email">Recovery Email Address</label>
                    <input
                      id="settings-email"
                      className="form-input"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="Enter recovery email address"
                      maxLength={254}
                    />
                    <div className="settings-email-row">
                      <span
                        className="settings-email-status"
                        data-state={formData.email_verified_at ? "verified" : "unverified"}
                      >
                        <MailCheck size={14} />
                        {formData.email_verified_at ? "Verified Account" : "Unverified"}
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
                        {sendingVerification ? <span className="spinner" /> : <Send size={13} />}
                        Send link
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div className="settings-section">
                <div className="modal-section-header">
                  <Bell size={15} />
                  <span>Notifications &amp; Alerts</span>
                </div>
                <div className="form-grid full">
                  <SettingsToggle
                    name="push_notifications_enabled"
                    checked={formData.push_notifications_enabled}
                    title="Android Push Notifications"
                    description="Receive instant release alerts directly on your Android device."
                    onChange={handleChange}
                  />

                  {/* Collapsible Advanced Diagnostics */}
                  {formData.push_notifications_enabled && (
                    <div className="settings-advanced-box">
                      <button
                        type="button"
                        className="settings-advanced-toggle"
                        onClick={() => setShowAdvancedPush((v) => !v)}
                      >
                        <Shield size={14} />
                        <span>Android Push Diagnostics</span>
                        <ChevronDown
                          size={14}
                          style={{
                            transform: showAdvancedPush ? "rotate(180deg)" : "none",
                            transition: "transform 0.2s",
                          }}
                        />
                      </button>
                      {showAdvancedPush && (
                        <div className="settings-push-test">
                          <span className="settings-push-test-icon" aria-hidden="true">
                            <Smartphone size={18} />
                          </span>
                          <span>
                            <strong>Delivery Test</strong>
                            <small>Sends a live Firebase push notification to registered devices.</small>
                          </span>
                          <button
                            type="button"
                            className="btn-ghost settings-inline-btn"
                            onClick={handlePushTest}
                            disabled={sendingPushTest || saving}
                          >
                            {sendingPushTest ? <span className="spinner" /> : <Send size={13} />}
                            {sendingPushTest ? "Testing…" : "Send Test Push"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <SettingsToggle
                    name="notifications_enabled"
                    checked={formData.notifications_enabled}
                    title="Telegram Notifications"
                    description="Receive chapter and episode alerts in your Telegram chat."
                    onChange={handleChange}
                  />
                  <div className="form-group">
                    <label htmlFor="settings-telegram-id">Telegram Chat ID</label>
                    <input
                      id="settings-telegram-id"
                      className="form-input"
                      name="telegram_chat_id"
                      value={formData.telegram_chat_id}
                      onChange={handleChange}
                      placeholder="e.g. 123456789"
                    />
                  </div>
                </div>
              </div>

              {/* Mobile App Section */}
              <div className="settings-section">
                <div className="modal-section-header">
                  <Smartphone size={15} />
                  <span>Mobile App</span>
                </div>
                <div className="settings-app-banner">
                  <div className="settings-app-icon-wrap">
                    <Smartphone size={22} />
                  </div>
                  <div className="settings-app-content">
                    <div className="settings-app-title-row">
                      <strong>Chronicle for Android</strong>
                      <span className="settings-app-badge">v1.0.4 Release</span>
                    </div>
                    <p>
                      Official signed APK with native push alerts, offline library caching, and quick home screen access.
                    </p>
                  </div>
                  <a
                    href="/downloads/chronicle.apk"
                    download="chronicle.apk"
                    className="settings-app-download-btn"
                    title="Download Chronicle Android APK"
                  >
                    <Download size={15} />
                    <span>Download APK (5338 KB)</span>
                  </a>
                </div>
              </div>

              {/* Data & Backup Section */}
              <div className="settings-section">
                <div className="modal-section-header">
                  <Database size={15} />
                  <span>Data &amp; Backup</span>
                </div>
                <div className="settings-data-grid">
                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={handleExport}
                    disabled={Boolean(dataAction)}
                  >
                    <span className="settings-action-icon">
                      <Upload size={18} />
                    </span>
                    <strong>Export Library</strong>
                    <small>Save full collection backup as JSON file.</small>
                    {dataAction === "export" && <i className="spinner" />}
                  </button>

                  <button
                    type="button"
                    className="settings-action-card"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={Boolean(dataAction)}
                  >
                    <span className="settings-action-icon">
                      <Download size={18} />
                    </span>
                    <strong>Import Library</strong>
                    <small>Restore or merge entries from JSON backup.</small>
                    {dataAction === "import" && <i className="spinner" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={Boolean(dataAction)}
                    className="settings-action-card settings-logout-card"
                  >
                    <span className="settings-action-icon danger">
                      <LogOut size={18} />
                    </span>
                    <strong>Sign Out</strong>
                    <small>End this browser session securely.</small>
                    {dataAction === "logout" && <i className="spinner" />}
                  </button>
                </div>
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

            <div className="modal-actions settings-modal-actions">
              <button
                type="button"
                className="btn-ghost settings-cancel-btn"
                onClick={onClose}
                disabled={saving}
              >
                Close
              </button>
              <button type="submit" className="btn-primary settings-save-btn" disabled={saving}>
                {saving ? <span className="spinner" /> : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

