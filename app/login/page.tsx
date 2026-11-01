"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/Brand";
import { useMediaStore } from "@/store/mediaStore";

type ChronicleNativeBridge = {
  persistSessionCookies?: () => void;
};

function persistNativeSessionCookies() {
  if (typeof window === "undefined") return;
  (
    window as typeof window & { ChronicleNative?: ChronicleNativeBridge }
  ).ChronicleNative?.persistSessionCookies?.();
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setAuth = useMediaStore((state) => state.setAuth);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("email");
    if (params.get("mode") === "register") {
      setIsRegister(true);
    }
    if (status === "verified") {
      setSuccess("Email verified. You can sign in.");
    } else if (status === "invalid") {
      setError("Verification link is invalid or expired.");
    }

    // If the user already has a valid session, redirect them to /home
    fetch("/api/auth", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((json) => {
        const payload = json?.data || json;
        if (payload?.loggedIn) {
          try {
            localStorage.setItem("chronicle_has_session", "true");
          } catch {}
          setAuth("authenticated", payload.username);
          router.replace("/home");
        }
      })
      .catch(() => {});
  }, [router, setAuth]);

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
      try {
        localStorage.setItem("chronicle_has_session", "true");
      } catch {}
      persistNativeSessionCookies();
      router.push("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-story">
        <Link href="/" aria-label="Chronicle home"><Brand /></Link>
        <span className="section-eyebrow">Your private story journal</span>
        <h2>Every story<br />leaves <em>a mark.</em></h2>
        <p>Keep your place in every world.<br />Anime, manhwa, donghua, and novels—together.</p>
      </div>
      <div className="auth-container">
        <Link className="auth-mobile-brand" href="/" aria-label="Chronicle home"><Brand /></Link>
        <div className="auth-card-heading">
          <span className="section-eyebrow">{isForgotPassword ? "Account recovery" : isRegister ? "A new chapter" : "Your collection awaits"}</span>
          <h1>{isForgotPassword ? "Find your way back." : isRegister ? "Start your chronicle." : "Welcome back."}</h1>
          <p>{isForgotPassword ? "We’ll email you a link to reset your password." : isRegister ? "A private place for the stories you watch and read." : "Pick up right where you left off."}</p>
        </div>
        <form className="auth-form-inner" onSubmit={handleSubmit}>
          {!isForgotPassword && <div className="auth-form-group">
            <label htmlFor="auth-username">Username</label>
            <div className="auth-input-wrap"><input id="auth-username" name="username" autoComplete="username" type="text" placeholder="Your username" maxLength={30} minLength={isRegister ? 3 : undefined} required value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          </div>}
          {(isRegister || isForgotPassword) && <div className="auth-form-group">
            <label htmlFor="auth-email">Email</label>
            <div className="auth-input-wrap"><input id="auth-email" name="email" autoComplete="email" type="email" placeholder="you@example.com" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>}
          {!isForgotPassword && <div className="auth-form-group">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-input-wrap auth-password-wrap">
              <input id="auth-password" name="password" autoComplete={isRegister ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} placeholder={isRegister ? "At least 6 characters" : "Your password"} minLength={isRegister ? 6 : undefined} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="password-visibility" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {success && <div className="auth-success" role="status">{success}</div>}
          <button type="submit" className="auth-btn btn-primary auth-submit" disabled={loading}>{loading && <span className="spinner" />}{isForgotPassword ? "Send reset link" : isRegister ? "Create your library" : "Open your library"}<ArrowRight size={16} /></button>
          {!isRegister && !isForgotPassword && <button type="button" className="auth-link" onClick={() => { setIsForgotPassword(true); setError(""); setSuccess(""); }}>Forgot password?</button>}
        </form>
        <div className="auth-mode-switch">
          {isForgotPassword ? <button type="button" onClick={() => { setIsForgotPassword(false); setError(""); setSuccess(""); }}>Back to sign in</button> : <>
            <span>{isRegister ? "Already have a chronicle?" : "New here?"}</span>
            <button type="button" disabled={loading} onClick={() => { setIsRegister((mode) => !mode); setError(""); setSuccess(""); }}>{isRegister ? "Sign in" : "Create a library"}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
