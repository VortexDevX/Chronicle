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
  mangadex_id?: string | null;
  custom_cover_url?: string | null;
  drop_reason?: string | null;
  retry_flag?: boolean;
  linked_entries?: string[];
  linked_entries_data?: { _id: string; title: string }[];
}

export type ImportRow = {
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

export type MediaLookup = {
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
