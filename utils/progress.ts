import type { MediaItem } from "@/types/media";

export const formatProgress = (value: number) => String(value);

/** Subtract stored decimal representations without exposing binary-float display noise. */
export function unreadDelta(latest: number, current: number) {
  if (!Number.isFinite(latest) || !Number.isFinite(current)) return 0;
  const parts = (value: number) => {
    const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
    const [whole, fraction = ""] = coefficient.split(".");
    const scale = fraction.length - Number(exponent);
    const units = BigInt(whole + fraction);
    return scale < 0 ? { units: units * BigInt(10) ** BigInt(-scale), scale: 0 } : { units, scale };
  };
  const a = parts(latest), b = parts(current);
  const scale = Math.max(a.scale, b.scale);
  const units = a.units * BigInt(10) ** BigInt(scale - a.scale) - b.units * BigInt(10) ** BigInt(scale - b.scale);
  return Math.max(0, Number(units) / 10 ** scale);
}

export function progressSummary(media: MediaItem, current = media.progress_current) {
  const screen = media.media_type === "Anime" || media.media_type === "Donghua";
  const unit = screen ? "episodes" : "chapters";
  const shortUnit = screen ? "Ep." : "Ch.";
  const knownTotal = media.progress_total > 0;
  const latest = media.latest_remote_progress;
  const unread = latest == null ? 0 : unreadDelta(latest, current);
  return {
    unit, shortUnit, knownTotal, unread,
    percent: knownTotal ? Math.max(0, Math.min(100, current / media.progress_total * 100)) : null,
    label: `${shortUnit} ${formatProgress(current)}${knownTotal ? ` / ${formatProgress(media.progress_total)}` : ""}`,
    availability: unread > 0
      ? `${formatProgress(unread)} ${unit} unread · latest ${formatProgress(latest!)}`
      : latest != null ? "Caught up to latest known release" : "Total not yet known",
    next: knownTotal ? Math.min(media.progress_total, current + 1) : current + 1,
  };
}
