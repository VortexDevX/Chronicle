import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand-wordmark"><Image className="catalogue-mark" src="/brand/chronicle-mark.png" width={44} height={44} alt="" unoptimized />{!compact && <span>Chronicle<span className="brand-subtitle">A personal story index</span></span>}</span>;
}
