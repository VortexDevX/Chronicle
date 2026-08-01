import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function MarketingHeader() {
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
        </nav>

        <div className="marketing-header-actions">
          <Link className="marketing-login" href="/login">
            Sign in
          </Link>
          <Link className="marketing-button compact" href="/login?mode=register">
            Create library <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
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
        <a href="https://github.com/VortexDevX/Chronicle">GitHub</a>
      </div>
    </footer>
  );
}
