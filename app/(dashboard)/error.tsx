"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty-state">
      <h3>Something went wrong</h3>
      <p>Refresh this view and try again.</p>
      <button className="btn-primary" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
