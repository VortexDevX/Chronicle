/** Auth API helpers + logout – now uses reactive store */
import { store } from "../state/store.js";
import { createInitialState } from "../state/core.js";
import { apiFetch } from "./client.js";

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return (await apiFetch("/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", username, password }),
  })) as { token: string; username: string };
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return (await apiFetch("/auth", {
    method: "POST",
    body: JSON.stringify({ action: "register", username, password }),
  })) as { token: string; username: string };
}

export function logout(): void {
  localStorage.clear();
  store.set(() => createInitialState());
}
