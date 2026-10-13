import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import {
  isAllowedMediaStatus,
  isAllowedMediaType,
} from "@/lib/mediaValidation";
import { normalizeMangaDexId } from "@/lib/mangadex";

export type MediaPayload = {
  title?: string;
  media_type?: string;
  status?: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number | null;
  notes?: string;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  tracker_url?: string | null;
  tracking_source?: "anilist" | "simkl" | "scraper" | "" | null;
  mangadex_id?: string | null;
  custom_cover_url?: string | null;
  drop_reason?: string | null;
  retry_flag?: boolean;
  numbering_mode?: "continuous" | "seasonal" | "unspecified" | "" | null;
  season_number?: number | null;
  episode_offset?: number | null;
  numbering_status?: "verified" | "needs_review" | "" | null;
  title_aliases?: {
    english?: string | null;
    pinyin?: string | null;
    hanzi?: string | null;
    custom?: string[];
  } | null;
  watch_url?: string | null;
};

export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;

const allowedExternalStatuses = new Set([
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
]);

export function buildTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateMediaPayload(
  payload: MediaPayload,
  partial = false,
): { ok: true; normalized: MediaPayload } | { ok: false; message: string } {
  const normalized: MediaPayload = {};

  if (!partial || payload.title !== undefined) {
    const title = String(payload.title || "").trim();
    if (!title) return { ok: false, message: "Title is required" };
    if (title.length > MAX_TITLE_LENGTH) {
      return {
        ok: false,
        message: `Title must be at most ${MAX_TITLE_LENGTH} characters`,
      };
    }
    normalized.title = title;
  }

  if (!partial || payload.media_type !== undefined) {
    const mediaType = String(payload.media_type || "");
    if (!isAllowedMediaType(mediaType)) {
      return { ok: false, message: "Invalid media type" };
    }
    normalized.media_type = mediaType;
  }

  if (!partial || payload.status !== undefined) {
    const status = String(payload.status || "");
    if (!isAllowedMediaStatus(status)) {
      return { ok: false, message: "Invalid status" };
    }
    normalized.status = status;
  }

  if (payload.progress_current !== undefined) {
    const current = Number(payload.progress_current);
    if (!Number.isFinite(current) || current < 0) {
      return { ok: false, message: "progress_current must be >= 0" };
    }
    normalized.progress_current = current;
  }

  if (payload.progress_total !== undefined) {
    const total = Number(payload.progress_total);
    if (!Number.isFinite(total) || total < 0) {
      return { ok: false, message: "progress_total must be >= 0" };
    }
    normalized.progress_total = total;
  }

  const currentForCheck =
    normalized.progress_current ?? payload.progress_current ?? 0;
  const totalForCheck =
    normalized.progress_total ?? payload.progress_total ?? 0;
  if (
    Number(totalForCheck) > 0 &&
    Number(currentForCheck) > Number(totalForCheck)
  ) {
    return {
      ok: false,
      message: "progress_current cannot exceed progress_total",
    };
  }

  if (payload.rating !== undefined && payload.rating !== null) {
    const rating = Number(payload.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      return { ok: false, message: "rating must be between 0 and 10" };
    }
    normalized.rating = rating;
  }

  if (payload.notes !== undefined) {
    const notes = String(payload.notes || "").trim();
    if (notes.length > MAX_NOTES_LENGTH) {
      return {
        ok: false,
        message: `Notes must be at most ${MAX_NOTES_LENGTH} characters`,
      };
    }
    normalized.notes = notes;
  }

  if (payload.drop_reason !== undefined) {
    normalized.drop_reason = payload.drop_reason
      ? String(payload.drop_reason).trim().substring(0, 500)
      : null;
  }

  if (payload.retry_flag !== undefined) {
    normalized.retry_flag = Boolean(payload.retry_flag);
  }

  if (payload.external_status !== undefined) {
    if (
      payload.external_status !== null &&
      !allowedExternalStatuses.has(payload.external_status)
    ) {
      return { ok: false, message: "Invalid external_status" };
    }
    normalized.external_status = payload.external_status ?? null;
  }

  if (payload.tracker_url !== undefined) {
    if (payload.tracker_url === null || payload.tracker_url === "") {
      normalized.tracker_url = null;
    } else {
      const url = normalizePublicHttpUrl(String(payload.tracker_url).trim());
      if (!url) {
        return {
          ok: false,
          message:
            "tracker_url must be a valid public http/https URL under 500 characters",
        };
      }
      normalized.tracker_url = url;
    }
  }

  if (payload.tracking_source !== undefined) {
    if (payload.tracking_source === null || payload.tracking_source === "") {
      normalized.tracking_source = null;
    } else if (
      payload.tracking_source === "anilist" ||
      payload.tracking_source === "simkl" ||
      payload.tracking_source === "scraper"
    ) {
      normalized.tracking_source = payload.tracking_source;
    } else {
      return {
        ok: false,
        message: "tracking_source must be 'anilist', 'simkl', or 'scraper'",
      };
    }
  }

  if (payload.mangadex_id !== undefined) {
    if (payload.mangadex_id === null || payload.mangadex_id === "") {
      normalized.mangadex_id = null;
    } else {
      const id = normalizeMangaDexId(payload.mangadex_id);
      if (!id) {
        return {
          ok: false,
          message: "Paste a valid MangaDex title URL or MangaDex ID",
        };
      }
      normalized.mangadex_id = id;
    }
  }

  if (payload.custom_cover_url !== undefined) {
    if (payload.custom_cover_url === null || payload.custom_cover_url === "") {
      normalized.custom_cover_url = null;
    } else {
      const url = normalizePublicHttpUrl(String(payload.custom_cover_url).trim());
      if (!url) {
        return {
          ok: false,
          message:
            "custom_cover_url must be a valid public http/https URL under 500 characters",
        };
      }
      normalized.custom_cover_url = url;
    }
  }

  if (payload.numbering_mode !== undefined) {
    if (payload.numbering_mode === null || payload.numbering_mode === "") {
      normalized.numbering_mode = null;
    } else if (["continuous", "seasonal", "unspecified"].includes(payload.numbering_mode)) {
      normalized.numbering_mode = payload.numbering_mode;
    } else {
      return { ok: false, message: "numbering_mode must be 'continuous', 'seasonal', or 'unspecified'" };
    }
  }

  if (payload.season_number !== undefined) {
    if (payload.season_number === null) {
      normalized.season_number = 1;
    } else {
      const season = Number(payload.season_number);
      if (!Number.isFinite(season) || season < 1) {
        return { ok: false, message: "season_number must be >= 1" };
      }
      normalized.season_number = Math.floor(season);
    }
  }

  if (payload.episode_offset !== undefined) {
    if (payload.episode_offset === null) {
      normalized.episode_offset = null;
    } else {
      const offset = Number(payload.episode_offset);
      if (!Number.isFinite(offset) || offset < 0) {
        return { ok: false, message: "episode_offset must be >= 0" };
      }
      normalized.episode_offset = Math.floor(offset);
    }
  }

  if (payload.numbering_status !== undefined) {
    if (payload.numbering_status === null || payload.numbering_status === "") {
      normalized.numbering_status = null;
    } else if (["verified", "needs_review"].includes(payload.numbering_status)) {
      normalized.numbering_status = payload.numbering_status;
    } else {
      return { ok: false, message: "numbering_status must be 'verified' or 'needs_review'" };
    }
  }

  if (payload.watch_url !== undefined) {
    if (payload.watch_url === null || payload.watch_url === "") {
      normalized.watch_url = null;
    } else {
      const url = normalizePublicHttpUrl(String(payload.watch_url).trim());
      if (!url) {
        return {
          ok: false,
          message: "watch_url must be a valid public http/https URL under 500 characters",
        };
      }
      normalized.watch_url = url;
    }
  }

  if (payload.title_aliases !== undefined) {
    if (payload.title_aliases === null) {
      normalized.title_aliases = null;
    } else if (typeof payload.title_aliases === "object") {
      normalized.title_aliases = {
        english: payload.title_aliases.english ? String(payload.title_aliases.english).trim().substring(0, 200) : null,
        pinyin: payload.title_aliases.pinyin ? String(payload.title_aliases.pinyin).trim().substring(0, 200) : null,
        hanzi: payload.title_aliases.hanzi ? String(payload.title_aliases.hanzi).trim().substring(0, 200) : null,
        custom: Array.isArray(payload.title_aliases.custom)
          ? payload.title_aliases.custom
              .map((a) => String(a || "").trim())
              .filter(Boolean)
              .slice(0, 10)
          : [],
      };
    }
  }

  return { ok: true, normalized };
}
