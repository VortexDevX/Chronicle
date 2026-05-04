"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart } from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setAuth = useMediaStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill all fields");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const action = isRegister ? "register" : "login";
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, username, password }),
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

          <div className="auth-error">{error}</div>

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
        </form>
      </div>
    </div>
  );
}
