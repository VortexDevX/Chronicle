"use client";

import { useState, useEffect } from "react";
import { MailCheck, Send, X } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

function SettingsToggle({
  name,
  checked,
  title,
  description,
  onChange,
}: {
  name: "notifications_enabled";
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
  const [formData, setFormData] = useState({
    email: "",
    email_verified_at: null as string | null,
    notifications_enabled: false,
    telegram_chat_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
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
