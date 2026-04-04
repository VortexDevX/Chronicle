/** API client — typed fetch wrapper with auth handling. */

import { state } from "../state/store.js";

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`/api${endpoint}`, { ...options, headers });
  if (res.status === 401) {
    // Trigger logout on auth failure
    const { logout } = await import("./auth.js");
    logout();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let message = "Request failed";
    let code = "";
    try {
      const payload = await res.json();
      message = payload?.message || payload?.code || message;
      code = payload?.code || "";
    } catch {
      const text = await res.text();
      message = text || message;
    }
    const err = new Error(message) as Error & {
      code?: string;
      status?: number;
    };
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}
