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
  source_id?: string | null;
  source?: "mangadex" | "mal" | "anilist" | null;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  read_url?: string | null;
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
