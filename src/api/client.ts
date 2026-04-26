/** API client — typed fetch wrapper with auth handling. Now uses reactive store */
import { store } from "../state/store.js";

type ApiEnvelope<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
};

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  const state = store.get();
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...normalizeHeaders(options.headers),
  };

  if (state.token) {
    mergedHeaders.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: mergedHeaders,
  });

  if (res.status === 401) {
    const { logout } = await import("./auth.js");
    logout();
    throw new Error("Unauthorized");
  }

  const text = await res.text();
  let payload: ApiEnvelope | null = null;
  try {
    payload = text ? (JSON.parse(text) as ApiEnvelope) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const code = payload?.error?.code || payload?.code || "";
    const message =
      payload?.error?.message || payload?.message || text || "Request failed";

    const err = new Error(message) as Error & {
      code?: string;
      status?: number;
    };
    err.code = code;
    err.status = res.status;
    throw err;
  }

  if (payload && typeof payload === "object" && "ok" in payload) {
    return payload.data;
  }

  return payload;
}
