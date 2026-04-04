/** DOM utility functions. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Safely query an element by ID and return typed result. */
export function $<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Query an element by ID, throw if not found. */
export function $$<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}
