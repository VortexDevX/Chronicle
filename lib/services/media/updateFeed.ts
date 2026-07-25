import type { MediaItem, TelegramUpdateState, UpdateFeedItem } from "@/types/media";

type UpdateProgressFields = Pick<
  MediaItem,
  "progress_current" | "latest_remote_progress" | "last_notified_progress"
>;

function finiteProgress(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function unreadDelta(item: UpdateProgressFields): number {
  const current = finiteProgress(item.progress_current) ?? 0;
  const latest = finiteProgress(item.latest_remote_progress) ?? current;
  return Math.max(0, Math.round((latest - current) * 1000) / 1000);
}

export function telegramUpdateState(
  item: UpdateProgressFields,
): TelegramUpdateState {
  const current = finiteProgress(item.progress_current) ?? 0;
  const latest = finiteProgress(item.latest_remote_progress) ?? current;
  const notified = finiteProgress(item.last_notified_progress);

  if (notified !== null && notified >= latest && latest > current) {
    return "fully_notified";
  }
  if (notified !== null && notified > current && notified < latest) {
    return "previously_notified";
  }
  return "not_notified";
}

export function toUpdateFeedItem(item: MediaItem): UpdateFeedItem {
  return {
    ...item,
    unread_delta: unreadDelta(item),
    telegram_state: telegramUpdateState(item),
  };
}
