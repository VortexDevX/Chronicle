/** Auth API helpers + logout. */

import { state } from "../state/store.js";
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
  state.token = "";
  state.username = "";
  state.media = [];
  state.total = 0;
  state.page = 1;
  state.hasMore = false;
  state.loading = false;
  state.loadingMore = false;
  state.search = "";
  state.filterType = "";
  state.filterStatus = "";
  state.sortBy = "last_updated";
  state.bulkMode = false;
  state.selectedIds.clear();
  // Re-render will be handled by the caller
}
