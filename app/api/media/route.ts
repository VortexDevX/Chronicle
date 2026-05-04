import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { MediaItem } from "@/lib/models";
import mongoose from "mongoose";
import { getClientIp } from "@/lib/rateLimit";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { logInternalError } from "@/lib/log";
import { jsonOk, jsonError } from "@/lib/http";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import {
  isAllowedMediaStatus,
  isAllowedMediaType,
} from "@/lib/mediaValidation";

type MediaPayload = {
  title?: string;
  media_type?: string;
  status?: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number;
  notes?: string;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  tracker_url?: string | null;
  mangadex_id?: string | null;
  custom_cover_url?: string | null;
  drop_reason?: string | null;
  retry_flag?: boolean;
};

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const allowedExternalStatuses = new Set([
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
]);

function validatePayload(
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
    normalized.progress_current = Math.floor(current);
  }

  if (payload.progress_total !== undefined) {
    const total = Number(payload.progress_total);
    if (!Number.isFinite(total) || total < 0) {
      return { ok: false, message: "progress_total must be >= 0" };
    }
    normalized.progress_total = Math.floor(total);
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
    normalized.drop_reason = payload.drop_reason ? String(payload.drop_reason).trim().substring(0, 500) : null;
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

  if (payload.mangadex_id !== undefined) {
    if (payload.mangadex_id === null || payload.mangadex_id === "") {
      normalized.mangadex_id = null;
    } else {
      const id = String(payload.mangadex_id).trim();
      if (id.length > 100) {
        return { ok: false, message: "mangadex_id is too long" };
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

  return { ok: true, normalized };
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeQueryValue(
  value: string | string[] | null | undefined,
  fallback = "",
): string {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || fallback);
  return raw.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const userObjectId = new mongoose.Types.ObjectId(userId!);
    const searchParams = req.nextUrl.searchParams;

    const search = normalizeQueryValue(searchParams.get("search"));
    const mediaType = normalizeQueryValue(searchParams.get("media_type"));
    const status = normalizeQueryValue(searchParams.get("status"));
    const statusNe = normalizeQueryValue(searchParams.get("status_ne"));
    const hasTracker = normalizeQueryValue(searchParams.get("has_tracker"));
    const sortBy = normalizeQueryValue(searchParams.get("sort_by"), "last_updated");
    const page = Math.max(
      1,
      parseInt(String(searchParams.get("page") || "1"), 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(searchParams.get("limit") || "24"), 10) || 24),
    );
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = { user_id: userObjectId };
    if (search) match.title = { $regex: escapeRegex(search), $options: "i" };
    if (mediaType && isAllowedMediaType(mediaType)) match.media_type = mediaType;
    if (status && isAllowedMediaStatus(status)) {
      if (status === "Active") {
        match.status = { $in: ["Active", "Watching/Reading"] };
      } else {
        match.status = status;
      }
    }
    if (statusNe && isAllowedMediaStatus(statusNe)) {
      if (statusNe === "Active") {
        match.status = { $nin: ["Active", "Watching/Reading"] };
      } else {
        match.status = { $ne: statusNe };
      }
    }
    if (hasTracker === "1" || hasTracker === "true") {
      match.tracker_url = { $ne: null, $exists: true, $regex: /.+/ };
    }

    const sortStage: Record<string, 1 | -1> =
      sortBy === "title"
        ? { title: 1 }
        : sortBy === "rating"
          ? { rating: -1, last_updated: -1 }
          : sortBy === "progress"
            ? { progress_pct: -1, last_updated: -1 }
            : { last_updated: -1 };

    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      {
        $addFields: {
          progress_pct: {
            $cond: [
              { $gt: ["$progress_total", 0] },
              { $divide: ["$progress_current", "$progress_total"] },
              0,
            ],
          },
        },
      },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "mediaitems",
          localField: "linked_entries",
          foreignField: "_id",
          as: "linked_entries_data"
        }
      },
      { $project: { progress_pct: 0 } },
    ];

    const [items, total] = await Promise.all([
      MediaItem.aggregate(pipeline),
      MediaItem.countDocuments(match),
    ]);

    return jsonOk({
      items,
      total,
      page,
      limit,
      has_more: skip + items.length < total,
    });
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "GET" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;
    const ip = getClientIp(req);
    const userObjectId = new mongoose.Types.ObjectId(userId!);
    const searchParams = req.nextUrl.searchParams;

    const isBulkDelete = String(searchParams.get("bulk_delete") || "") === "1";
    if (isBulkDelete) {
      const guard = await enforceRateLimit(req, {
        key: `media:bulk_delete:${userId}:${ip}`,
        limit: 300,
        windowMs: 15 * 60 * 1000,
        strict: true,
        route: "media",
        method: "POST",
        operation: "bulk_delete",
        userId,
        message: "Too many bulk delete requests. Please retry shortly.",
      });
      if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

      const parsed = await req.json().catch(() => ({}));
      const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
      if (ids.length === 0) {
        return jsonError(
          "INVALID_BULK_PAYLOAD",
          "ids must be a non-empty array",
          400,
        );
      }
      if (ids.length > 500) {
        return jsonError(
          "BULK_LIMIT_EXCEEDED",
          "Bulk delete payload too large (max 500 ids per request)",
          400,
        );
      }

      const objectIds = ids
        .filter((x: string) => isValidObjectId(x))
        .map((x: string) => new mongoose.Types.ObjectId(x));
      if (objectIds.length === 0) {
        return jsonError(
          "INVALID_BULK_PAYLOAD",
          "No valid ids provided",
          400,
        );
      }

      const result = await MediaItem.deleteMany({
        _id: { $in: objectIds },
        user_id: userObjectId,
      });
      return jsonOk({
        deleted: Number(result.deletedCount || 0),
        requested: ids.length,
      });
    }

    const guard = await enforceRateLimit(req, {
      key: `media:post:${userId}:${ip}`,
      limit: 3000,
      windowMs: 15 * 60 * 1000,
      strict: true,
      route: "media",
      method: "POST",
      userId,
      message: "Too many write requests. Please retry shortly.",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const isBulk = String(searchParams.get("bulk") || "") === "1";
    const parsed = await req.json().catch(() => ({}));

    if (isBulk) {
      if (!Array.isArray(parsed)) {
        return jsonError(
          "INVALID_BULK_PAYLOAD",
          "Bulk payload must be an array",
          400,
        );
      }
      if (parsed.length === 0) {
        return jsonOk({ inserted: 0, skipped: 0 });
      }
      if (parsed.length > 200) {
        return jsonError(
          "BULK_LIMIT_EXCEEDED",
          "Bulk payload too large (max 200 items per request)",
          400,
        );
      }

      const docs: Record<string, unknown>[] = [];
      let skipped = 0;
      for (const entry of parsed as MediaPayload[]) {
        const validated = validatePayload(entry, false);
        if (!validated.ok) {
          skipped += 1;
          continue;
        }
        docs.push({
          ...validated.normalized,
          user_id: userObjectId,
          last_updated: new Date(),
        });
      }

      if (docs.length === 0) {
        return jsonOk({ inserted: 0, skipped });
      }

      const insertedDocs = await MediaItem.insertMany(docs, {
        ordered: false,
      });
      return jsonOk({ inserted: insertedDocs.length, skipped }, 201);
    }

    const raw = parsed as MediaPayload;
    const validated = validatePayload(raw, false);
    if (!validated.ok) {
      return jsonError("INVALID_MEDIA_PAYLOAD", validated.message, 400);
    }

    const duplicateMode = String(searchParams.get("duplicate_mode") || "reject");
    const normalizedTitle = String(validated.normalized.title || "")
      .trim()
      .replace(/\s+/g, " ");
    const normalizedType = String(validated.normalized.media_type || "");
    const duplicate = await MediaItem.findOne({
      user_id: userObjectId,
      media_type: normalizedType,
      title: {
        $regex: `^${escapeRegex(normalizedTitle)}$`,
        $options: "i",
      },
    });

    if (duplicate && duplicateMode !== "keep_both") {
      if (duplicateMode === "merge") {
        const merged = await MediaItem.findOneAndUpdate(
          { _id: duplicate._id, user_id: userObjectId },
          { ...validated.normalized, last_updated: new Date() },
          { new: true },
        );
        if (!merged) {
          return jsonError("NOT_FOUND", "Not found", 404);
        }
        return jsonOk({ merged: true, item: merged });
      }
      return jsonError(
        "DUPLICATE_TITLE",
        "A similar title already exists for this type. Merge or keep both?",
        409,
      );
    }

    const newItem = await MediaItem.create({
      ...validated.normalized,
      user_id: userObjectId,
      last_updated: new Date(),
    });
    return jsonOk(newItem, 201);
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "POST" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;
    const ip = getClientIp(req);
    const userObjectId = new mongoose.Types.ObjectId(userId!);

    const guard = await enforceRateLimit(req, {
      key: `media:put:${userId}:${ip}`,
      limit: 3000,
      windowMs: 15 * 60 * 1000,
      strict: true,
      route: "media",
      method: "PUT",
      userId,
      message: "Too many write requests. Please retry shortly.",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const id = req.nextUrl.searchParams.get("id");
    if (!id || !isValidObjectId(id)) {
      return jsonError("MISSING_OR_INVALID_ID", "Missing or invalid ID", 400);
    }

    const raw = (await req.json().catch(() => ({}))) as MediaPayload;
    const validated = validatePayload(raw, true);
    if (!validated.ok) {
      return jsonError("INVALID_MEDIA_PAYLOAD", validated.message, 400);
    }

    const updated = await MediaItem.findOneAndUpdate(
      { _id: id, user_id: userObjectId },
      validated.normalized,
      { new: true },
    );
    if (!updated) {
      return jsonError("NOT_FOUND", "Not found", 404);
    }
    return jsonOk(updated);
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "PUT" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;
    const ip = getClientIp(req);
    const userObjectId = new mongoose.Types.ObjectId(userId!);

    const guard = await enforceRateLimit(req, {
      key: `media:delete:${userId}:${ip}`,
      limit: 3000,
      windowMs: 15 * 60 * 1000,
      strict: true,
      route: "media",
      method: "DELETE",
      userId,
      message: "Too many write requests. Please retry shortly.",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const id = req.nextUrl.searchParams.get("id");
    if (!id || !isValidObjectId(id)) {
      return jsonError("MISSING_OR_INVALID_ID", "Missing or invalid ID", 400);
    }

    const deleted = await MediaItem.findOneAndDelete({
      _id: id,
      user_id: userObjectId,
    });
    if (!deleted) {
      return jsonError("NOT_FOUND", "Not found", 404);
    }
    return jsonOk({ success: true });
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "DELETE" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
