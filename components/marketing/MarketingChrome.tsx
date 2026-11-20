import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import styles from "@/app/landing.module.css";

export function MarketingHeaderActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (isAuthenticated) {
    return (
      <div className="marketing-header-actions">
        <ThemeToggle />
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
      <ThemeToggle />
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
    <div className={styles.actions}>
      <Link className="marketing-button" href={isAuthenticated ? "/home" : "/login?mode=register"}>
        {isAuthenticated ? "Back to your stories" : "Start your chronicle"}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <a className={styles.secondaryLink} href="#features">
        Explore features <span aria-hidden="true">↓</span>
      </a>
    </div>
  );
}

export function LandingFinalAction({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className={styles.actions}>
      <Link className="marketing-button" href={isAuthenticated ? "/library" : "/login?mode=register"}>
        {isAuthenticated ? "Open your library" : "Create your library"}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <a className={styles.secondaryLink} href="/downloads/chronicle.apk" download="chronicle.apk">
        <Download size={17} aria-hidden="true" /> Get the Android app
      </a>
    </div>
  );
}

export function MarketingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Link className="marketing-brand" href="/" aria-label="Chronicle The story continues home">
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
        <p>Your anime, manhwa, donghua, and light novels in one place.</p>
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

