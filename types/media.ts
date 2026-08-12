/** Core data types for Chronicle. */

export interface MediaItem {
  _id: string;
  title: string;
  media_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  rating?: number;
  notes?: string;
  last_updated: string;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  tracker_url?: string | null;
  last_checked_at?: string | null;
  last_scrape_status?: "ok" | "error" | null;
  last_scrape_error?: string | null;
  latest_remote_progress?: number | null;
  last_notified_progress?: number | null;
  mangadex_id?: string | null;
  custom_cover_url?: string | null;
  drop_reason?: string | null;
  retry_flag?: boolean;
  linked_entries?: string[];
  linked_entries_data?: { _id: string; title: string }[];
}

type ImportRow = {
  title: string;
  media_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  rating?: number;
  notes?: string;
};

export type CoverCacheEntry = {
  url: string | null;
  ts: number;
};

type MediaLookup = {
  title?: string;
  total?: number;
  source: "AniList" | "MAL";
};

export interface Shelf {
  _id: string;
  name: string;
  description?: string;
  media_ids: string[];
}

export type TelegramUpdateState =
  | "fully_notified"
  | "previously_notified"
  | "not_notified";

export interface UpdateFeedItem extends MediaItem {
  unread_delta: number;
  telegram_state: TelegramUpdateState;
}

export interface ActivityItem {
  _id: string;
  media_id: string;
  title: string;
  media_type: string;
  delta: number;
  occurred_at: string;
}

export interface ActivityDay {
  date: string;
  units: number;
  events: number;
}

export interface ActivityPayload {
  events: ActivityItem[];
  days: ActivityDay[];
}

export interface UpdatesPayload {
  items: UpdateFeedItem[];
  tracker_errors: MediaItem[];
  partial_failures?: string[];
}

export interface HomePayload {
  featured: MediaItem | null;
  continue_items: MediaItem[];
  updates: UpdateFeedItem[];
  activity: ActivityItem[];
  rhythm: ActivityDay[];
  partial_failures?: string[];
}

export type CronDeliveryState =
  | "not_needed"
  | "disabled"
  | "unavailable"
  | "sent"
  | "partial"
  | "failed"
  | "deferred";

export interface CronHistoryItem {
  _id: string;
  started_at: string;
  completed_at: string;
  status: "success" | "partial";
  selected: number;
  checked: number;
  updates_found: number;
  tracker_failures: number;
  deferred: number;
  duration_ms: number;
  telegram_delivery: CronDeliveryState;
  push_delivery: CronDeliveryState;
  updates: Array<{
    media_id: string;
    title: string;
    media_type: string;
    current: number;
    latest: number;
  }>;
  tracker_errors: Array<{ title: string; message: string }>;
}

export interface CronHistoryPayload {
  items: CronHistoryItem[];
  retention_days: number;
}
