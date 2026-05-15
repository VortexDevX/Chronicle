"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart } from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setAuth = useMediaStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isForgotPassword) {
      if (!email) {
        setError("Enter your email address");
        return;
      }
    } else if (!username || !password || (isRegister && !email)) {
      setError("Please fill all fields");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (isForgotPassword) {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || "Password reset failed");
        }
        setSuccess(data.data?.message || "If an account exists, a reset link has been sent.");
        return;
      }

      const action = isRegister ? "register" : "login";
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Authentication failed");
      }

      setAuth("authenticated", data.data?.username || username);
      router.push("/library");
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
        <div className="auth-subtitle">Media Tracker</div>

        <form className="auth-form-inner" onSubmit={handleSubmit}>
          {!isForgotPassword ? (
            <div className="auth-form-group">
              <label>Username</label>
              <div className="auth-input-wrap">
                <input
                  type="text"
                  placeholder="Enter username"
                  maxLength={30}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {(isRegister || isForgotPassword) && (
            <div className="auth-form-group">
              <label>Email</label>
              <div className="auth-input-wrap">
                <input
                  type="email"
                  placeholder="Enter email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          {!isForgotPassword ? (
            <div className="auth-form-group">
              <label>Password</label>
              <div className="auth-input-wrap">
                <input
                  type="password"
                  placeholder="Enter password"
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {isForgotPassword ? (
            <div className="auth-actions">
              <button
                type="button"
                className="auth-btn btn-ghost"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError("");
                  setSuccess("");
                }}
                disabled={loading}
              >
                Back
              </button>
              <button type="submit" className="auth-btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner" /> : null}
                Send reset link
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setIsForgotPassword(true);
                  setIsRegister(false);
                  setError("");
                  setSuccess("");
                }}
              >
                Forgot password?
              </button>
              <div className="auth-actions">
                <button
                  type={!isRegister ? "submit" : "button"}
                  className={`auth-btn ${!isRegister ? "btn-primary" : "btn-ghost"}`}
                  onClick={isRegister ? () => setIsRegister(false) : undefined}
                  disabled={loading}
                >
                  {loading && !isRegister ? <span className="spinner" /> : null}
                  Login
                </button>
                <button
                  type={isRegister ? "submit" : "button"}
                  className={`auth-btn ${isRegister ? "btn-primary" : "btn-ghost"}`}
                  onClick={!isRegister ? () => setIsRegister(true) : undefined}
                  disabled={loading}
                >
                  {loading && isRegister ? <span className="spinner" /> : null}
                  Register
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
