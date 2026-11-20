"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Brand } from "@/components/Brand";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="fallback-page">
    <Link href="/" aria-label="Chronicle The story continues home"><Brand /></Link>
    <section className="state-panel state-error" role="alert">
      <span className="section-eyebrow">A brief intermission</span>
      <h1>This page couldn’t load.</h1>
      <p>Try loading it again. Your saved progress stays in your library.</p>
      <div className="fallback-actions"><button className="btn-primary" onClick={retry}><RefreshCw size={17} /> Try again</button><Link href="/" className="btn-ghost">Back to Chronicle</Link></div>
    </section>
  </main>;
}
