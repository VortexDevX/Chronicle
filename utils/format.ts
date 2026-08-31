/** Formatting utilities — pure functions, no side effects. */

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
}

export function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function progressLabel(mediaType: string): string {
  if (mediaType === "Anime" || mediaType === "Donghua") return "ep";
  return "ch";
}

function escapeHtml(str: string): string {
  return str; // React handles escaping natively
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatReleaseCountdown(dateStr: string, now: number = Date.now()): string {
  const target = new Date(dateStr).getTime();
  if (isNaN(target)) return "";
  const remaining = target - now;
  if (remaining <= 0) return "Available now";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `In ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `In ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `In ${days}d`;
}

export function formatReleaseSchedule(dateStr: string, now: number = Date.now()): string {
  const target = new Date(dateStr).getTime();
  if (isNaN(target)) return "";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(target);
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  
  const timePart = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(targetDate);
  if (dayDiff === 0) return `Today · ${timePart}`;
  if (dayDiff === 1) return `Tomorrow · ${timePart}`;
  if (dayDiff > 1 && dayDiff <= 6) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(targetDate);
    return `${weekday} · ${timePart}`;
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(targetDate);
}

function slugType(mediaType: string): string {
  return mediaType.toLowerCase().replace(/\s+/g, "-");
}

