"use client";

export default function LoginError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="auth-bg">
      <div className="auth-container">
        <div className="auth-error">Login view failed to load.</div>
        <button className="auth-btn btn-primary" onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
