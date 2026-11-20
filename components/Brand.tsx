export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand-wordmark"><svg className="catalogue-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="15" fill="#c5b0ea"/><path d="M43 18H28c-9 0-15 6-15 14s6 14 15 14h15v-8H28a6 6 0 0 1 0-12h15Z" fill="#30223e"/><path d="M43 10h9v20l-4.5-3.5L43 30Z" fill="#fffaf1"/></svg>{!compact && <span>Chronicle{" "}<span className="brand-subtitle">The story continues</span></span>}</span>;
}
