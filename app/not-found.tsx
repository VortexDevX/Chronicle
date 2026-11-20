import Link from "next/link";
import { ArrowLeft, Library } from "lucide-react";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return <main className="fallback-page">
    <Link href="/" aria-label="Chronicle The story continues home"><Brand /></Link>
    <section className="state-panel">
      <span className="fallback-code" aria-hidden="true">404 /</span>
      <h1>This chapter is missing.</h1>
      <p>The page may have moved, or the link is incomplete. Your stories are still waiting.</p>
      <div className="fallback-actions"><Link href="/" className="btn-primary"><ArrowLeft size={17} /> Back to Chronicle</Link><Link href="/library" className="btn-ghost"><Library size={17} /> Open library</Link></div>
    </section>
  </main>;
}
