import { useEffect } from "react";
import { useMediaStore } from "@/store/mediaStore";

export function useAuth() {
  const authStatus = useMediaStore((state) => state.authStatus);
  const username = useMediaStore((state) => state.username);
  const setAuth = useMediaStore((state) => state.setAuth);

  useEffect(() => {
    if (authStatus !== "loading") return;

    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (!isMounted) return;

        if (res.status === 401) {
          try {
            localStorage.removeItem("chronicle_has_session");
          } catch {}
          setAuth("unauthenticated");
          return;
        }

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const json = await res.json();
        if (!isMounted) return;

        const payload = json.data || json;
        if (payload.loggedIn) {
          try {
            localStorage.setItem("chronicle_has_session", "true");
          } catch {}
          setAuth("authenticated", payload.username);
        } else {
          try {
            localStorage.removeItem("chronicle_has_session");
          } catch {}
          setAuth("unauthenticated");
        }
      } catch {
        if (!isMounted) return;

        let hadSession = false;
        try {
          hadSession = localStorage.getItem("chronicle_has_session") === "true";
        } catch {}

        if (retryCount < maxRetries) {
          retryCount++;
          retryTimer = setTimeout(checkSession, retryCount * 1500);
        } else if (hadSession) {
          // Keep waiting for network recovery instead of destroying session on offline/flaky network
        } else {
          setAuth("unauthenticated");
        }
      }
    };

    checkSession();

    const handleRecheck = () => {
      if (document.visibilityState === "visible" || navigator.onLine) {
        checkSession();
      }
    };

    window.addEventListener("online", handleRecheck);
    document.addEventListener("visibilitychange", handleRecheck);

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", handleRecheck);
      document.removeEventListener("visibilitychange", handleRecheck);
    };
  }, [authStatus, setAuth]);

  return { authStatus, username };
}
