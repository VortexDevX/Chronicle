export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "REQUEST_FAILED", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
};

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || payload?.message || "Request failed",
      payload?.error?.code || payload?.code || "REQUEST_FAILED",
      response.status,
    );
  }

  if (typeof window !== "undefined" && String(input).startsWith("/api/shelves") && init.method && init.method !== "GET") {
    window.dispatchEvent(new Event("chronicle-shelves-changed"));
  }
  return (payload?.data ?? payload) as T;
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong") {
  return error instanceof Error && error.message ? error.message : fallback;
}
