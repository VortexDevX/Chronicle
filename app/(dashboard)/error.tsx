"use client";

import { RefreshCw } from "lucide-react";

export default function DashboardError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="empty-state state-error" role="alert">
      <span className="section-eyebrow">A brief intermission</span>
      <h3>Something went wrong</h3>
      <p>Refresh this view and try again.</p>
      <button className="btn-primary" onClick={retry}>
        <RefreshCw size={17} /> Retry
      </button>
    </div>
  );
}
