import { Brand } from "@/components/Brand";
import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";

export function MarketingHeaderActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) {
    return (
      <div className="marketing-header-actions">
        <Link className="marketing-login" href="/home">
          Home
        </Link>
        <Link className="marketing-button compact" href="/library">
          Open library <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="marketing-header-actions">
      <Link className="marketing-login" href="/login">
        Sign in
      </Link>
      <Link className="marketing-button compact" href="/login?mode=register">
        Create library <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}

export function LandingHeroActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="simple-actions">
      <Link
        className="marketing-button"
        href={isAuthenticated ? "/library" : "/login?mode=register"}
      >
        {isAuthenticated ? "Open library" : "Create your list"}{" "}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <a
        className="marketing-button secondary"
        href="/downloads/chronicle.apk"
        download="chronicle.apk"
        title="Download Chronicle Android App (v1.0.4 APK)"
      >
        <Smartphone size={16} aria-hidden="true" />
        Download App
      </a>
      <Link className="simple-text-link" href={isAuthenticated ? "/home" : "/login"}>
        {isAuthenticated ? "Home" : "Sign in"}
      </Link>
    </div>
  );
}

export function LandingFinalAction({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="simple-actions">
      <Link
        className="marketing-button"
        href={isAuthenticated ? "/library" : "/login?mode=register"}
      >
        {isAuthenticated ? "Open your library" : "Start tracking"}{" "}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <a
        className="marketing-button secondary"
        href="/downloads/chronicle.apk"
        download="chronicle.apk"
        title="Download Chronicle Android App (APK)"
      >
        <Smartphone size={16} aria-hidden="true" />
        Download APK
      </a>
    </div>
  );
}

export function MarketingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Link className="marketing-brand" href="/" aria-label="Chronicle X home">
          <Brand />
        </Link>

        <nav className="marketing-nav" aria-label="Public navigation">
          <Link href="/#features">Features</Link>
          <Link href="/#trackers">Formats</Link>
          <a
            href="/downloads/chronicle.apk"
            download="chronicle.apk"
            title="Download Android APK"
          >
            Download App
          </a>
        </nav>

        <MarketingHeaderActions isAuthenticated={isAuthenticated} />
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer simple-footer">
      <div className="marketing-container simple-footer-inner">
        <Link className="marketing-brand" href="/">
          <Brand />
        </Link>
        <p>Your anime, manhwa, donghua, and novels. One story space.</p>
        <div className="simple-footer-links">
          <a href="/downloads/chronicle.apk" download="chronicle.apk">
            Download App (APK)
          </a>
          <a href="https://github.com/VortexDevX/Chronicle">GitHub</a>
        </div>
      </div>
    </footer>
  );
}

