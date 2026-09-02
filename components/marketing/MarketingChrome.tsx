import Image from "next/image";
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
          <Image
            src="/favicon.png"
            alt=""
            width={36}
            height={36}
            priority
          />
          <span>
            Chronicle <strong>X</strong>
          </span>
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
          Chronicle <strong>X</strong>
        </Link>
        <p>Track what you watch and read. Chronicle never hosts the media itself.</p>
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

