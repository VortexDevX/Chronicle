import mongoose from "mongoose";
import {
  isAllowedMediaStatus,
  isAllowedMediaType,
} from "@/lib/mediaValidation";

export type MediaListParams = {
  search: string;
  mediaType: string;
  status: string;
  statusNe: string;
  hasTracker: string;
  sortBy: string;
  page: number;
  limit: number;
  skip: number;
};

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeQueryValue(
  value: string | string[] | null | undefined,
  fallback = "",
): string {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || fallback);
  return raw.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseMediaListParams(
  searchParams: URLSearchParams,
): MediaListParams {
  const page = Math.max(
    1,
    parseInt(String(searchParams.get("page") || "1"), 10) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(searchParams.get("limit") || "24"), 10) || 24),
  );

  return {
    search: normalizeQueryValue(searchParams.get("search")),
    mediaType: normalizeQueryValue(searchParams.get("media_type")),
    status: normalizeQueryValue(searchParams.get("status")),
    statusNe: normalizeQueryValue(searchParams.get("status_ne")),
    hasTracker: normalizeQueryValue(searchParams.get("has_tracker")),
    sortBy: normalizeQueryValue(searchParams.get("sort_by"), "last_updated"),
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildMediaMatch(
  params: MediaListParams,
  userObjectId: mongoose.Types.ObjectId,
): Record<string, unknown> {
  const match: Record<string, unknown> = { user_id: userObjectId };

  if (params.search) {
    match.title = { $regex: escapeRegex(params.search), $options: "i" };
  }
  if (params.mediaType && isAllowedMediaType(params.mediaType)) {
    match.media_type = params.mediaType;
  }
  if (params.status && isAllowedMediaStatus(params.status)) {
    if (params.status === "Active") {
      match.status = { $in: ["Active", "Watching/Reading"] };
    } else {
      match.status = params.status;
    }
  }
  if (params.statusNe && isAllowedMediaStatus(params.statusNe)) {
    if (params.statusNe === "Active") {
      match.status = { $nin: ["Active", "Watching/Reading"] };
    } else {
      match.status = { $ne: params.statusNe };
    }
  }
  if (params.hasTracker === "1" || params.hasTracker === "true") {
    match.tracker_url = { $ne: null, $exists: true, $regex: /.+/ };
  }

  return match;
}

export function buildMediaSortStage(sortBy: string): Record<string, 1 | -1> {
  if (sortBy === "title") return { title: 1 };
  if (sortBy === "rating") return { rating: -1, last_updated: -1 };
  if (sortBy === "progress") return { progress_pct: -1, last_updated: -1 };
  return { last_updated: -1 };
}
