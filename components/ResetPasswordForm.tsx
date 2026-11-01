"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "./Brand";

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
          <Link href="/" aria-label="Chronicle home"><Brand /></Link>
        </div>
        <div className="auth-card-heading"><h1>A fresh start.</h1><p>Choose a new password for your chronicle.</p></div>
        {!token && <p className="auth-error" role="alert">This reset link is missing or expired. Return to sign in and request a new link.</p>}

        <form className="auth-form-inner" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="new-password">New password</label>
            <div className="auth-input-wrap">
              <input
                type="password"
                id="new-password"
                autoComplete="new-password"
                minLength={6}
                placeholder="Enter new password"
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <label htmlFor="confirm-password">Confirm password</label>
            <div className="auth-input-wrap">
              <input
                type="password"
                placeholder="Confirm new password"
                id="confirm-password"
                autoComplete="new-password"
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {success && <div className="auth-success" role="status">{success}</div>}

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
