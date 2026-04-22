/** Auth API helpers + logout – now uses reactive store */
import { store } from "../state/store.js";
import { apiFetch } from "./client.js";

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return apiFetch("/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", username, password }),
  });
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return apiFetch("/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", username, password }),
  });
}

export function logout(): void {
  localStorage.clear();
  store.set(() => ({
    token: "",
    username: "",
    media: [],
    search: "",
    filterType: "",
    filterStatus: "",
    sortBy: "last_updated",
    loading: false,
    loadingMore: false,
    page: 1,
    limit: 24,
    hasMore: false,
    total: 0,
    bulkMode: false,
    selectedIds: new Set<string>(),
    globalStats: null,
  }));
}
