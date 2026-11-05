import { apiRequest } from "./api";
import type { Shelf } from "@/types/media";

let cached: Shelf[] | null = null;
let expires = 0;
let pending: Promise<Shelf[]> | null = null;
let generation = 0;

export function clearShelfPicker() {
  cached = null; expires = 0; pending = null; generation++;
}

export function loadShelfPicker(): Promise<Shelf[]> {
  if (cached && Date.now() < expires) return Promise.resolve(cached);
  if (pending) return pending;
  const started = generation;
  const request = apiRequest<{items:Shelf[]}>("/api/shelves?picker=1",{cache:"no-store"}).then(data => {
    const items = Array.isArray(data.items) ? data.items : [];
    if (started === generation) { cached = items; expires = Date.now() + 30000; }
    return items;
  }).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}
