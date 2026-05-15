"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart } from "lucide-react";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Reset link is invalid or expired");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Could not reset password");
      }

      setSuccess("Password reset. Use the new password to log in.");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-container">
        <div className="auth-brand">
          <BookHeart size={32} className="auth-brand-logo" style={{ color: "var(--accent)" }} />
          <div className="auth-brand-name">CHRONICLE</div>
        </div>
        <div className="auth-subtitle">Reset password</div>

        <form className="auth-form-inner" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label>New password</label>
            <div className="auth-input-wrap">
              <input
                type="password"
                placeholder="Enter new password"
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <label>Confirm password</label>
            <div className="auth-input-wrap">
              <input
                type="password"
                placeholder="Confirm new password"
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <div className="auth-actions">
            <button type="button" className="auth-btn btn-ghost" onClick={() => router.push("/login")}>
              Back
            </button>
            <button type="submit" className="auth-btn btn-primary" disabled={loading || !token}>
              {loading ? <span className="spinner" /> : null}
              Reset password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
