"use client";

import { Brand } from "@/components/Brand";

export default function LoginError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="auth-bg">
      <div className="auth-container">
        <Brand />
        <div className="auth-error" role="alert">Login view failed to load.</div>
        <button className="auth-btn btn-primary" onClick={retry}>
          Retry
        </button>
      </div>
    </div>
  );
}
