import { useEffect } from "react";
import { useMediaStore } from "@/store/mediaStore";

export function useAuth() {
  const authStatus = useMediaStore((state) => state.authStatus);
  const username = useMediaStore((state) => state.username);
  const setAuth = useMediaStore((state) => state.setAuth);

  useEffect(() => {
    if (authStatus !== "loading") return;

    fetch("/api/auth", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((json) => {
        // API wraps response in { ok, data: { loggedIn, username, userId } }
        const payload = json.data || json;
        if (payload.loggedIn) {
          setAuth("authenticated", payload.username);
        } else {
          setAuth("unauthenticated");
        }
      })
      .catch(() => {
        setAuth("unauthenticated");
      });
  }, [authStatus, setAuth]);

  return { authStatus, username };
}
