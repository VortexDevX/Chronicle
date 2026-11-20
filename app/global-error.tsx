"use client";

import "./globals.css";
import "./sakuga.css";
import "./themes.css";
import { Brand } from "@/components/Brand";
import { THEME_BOOTSTRAP } from "@/lib/client/theme";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head><body><main className="fallback-page">
    <Brand />
    <section className="state-panel state-error" role="alert">
      <span className="section-eyebrow">A brief intermission</span>
      <h1>Chronicle needs another take.</h1>
      <p>Something interrupted this page. Try again to return to your stories.</p>
      <div className="fallback-actions">
        <button className="btn-primary" onClick={retry}>Try again</button>
        {/* A root-layout failure needs full document navigation to recover. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn-ghost" href="/">Back to Chronicle</a>
      </div>
    </section>
  </main></body></html>;
}
