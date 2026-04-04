import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem } from "./utils/db.js";
import { verifyToken } from "./utils/auth.js";
import mongoose from "mongoose";
import { checkRateLimit, getClientIp } from "./utils/rateLimit.js";
import { logInternalError, logSecurityEvent } from "./utils/log.js";
import { handleOptions, setCors, jsonOk, jsonError } from "./utils/http.js";

type MediaPayload = {
  title?: string;
  media_type?: string;
  status?: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number;
  notes?: string;
  source_id?: string | null;
  source?: "mangadex" | "mal" | "anilist" | null;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  read_url?: string | null;
};

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

const allowedTypes = new Set(["Anime", "Manhwa", "Donghua", "Light Novel"]);
const allowedStatuses = new Set([
  "Planned",
  "Watching/Reading",
  "On Hold",
  "Dropped",
  "Completed",
]);
const allowedSources = new Set(["mangadex", "mal", "anilist"]);
const allowedExternalStatuses = new Set([
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
]);

/** Validate a URL using the URL constructor + protocol check. */
function isValidHttpUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
    if (!allowedTypes.has(mediaType)) {
      return { ok: false, message: "Invalid media type" };
    }
    normalized.media_type = mediaType;
  }

  if (!partial || payload.status !== undefined) {
    const status = String(payload.status || "");
    if (!allowedStatuses.has(status)) {
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

  // ── External source fields ──────────────────────────────────

  if (payload.source_id !== undefined) {
    normalized.source_id = payload.source_id
      ? String(payload.source_id).trim().slice(0, 100)
      : null;
  }

  if (payload.source !== undefined) {
    if (payload.source !== null && !allowedSources.has(payload.source)) {
      return { ok: false, message: "Invalid source" };
    }
    normalized.source = payload.source ?? null;
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

  if (payload.read_url !== undefined) {
    if (payload.read_url === null || payload.read_url === "") {
      normalized.read_url = null;
    } else {
      const url = String(payload.read_url).trim();
      if (url && !isValidHttpUrl(url)) {
        return {
          ok: false,
          message: "read_url must be a valid http/https URL",
        };
      }
      normalized.read_url = url.slice(0, 500);
    }
  }

  return { ok: true, normalized };
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Validate a string is a valid MongoDB ObjectId. */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  try {
    await connectDB();
    const userId = verifyToken(req.headers.authorization);
    if (!userId) {
      return jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
    }
    const ip = getClientIp(req);

    const id = req.query.id as string | undefined;

    // Validate id if provided
    if (id && !isValidObjectId(id)) {
      return jsonError(res, "INVALID_ID", "Invalid ID format", 400);
    }

    switch (req.method) {
      case "GET": {
        const search = String(req.query.search || "").trim();
        const mediaType = String(req.query.media_type || "").trim();
        const status = String(req.query.status || "").trim();
        const sortBy = String(req.query.sort_by || "last_updated");
        const page = Math.max(
          1,
          parseInt(String(req.query.page || "1"), 10) || 1,
        );
        const limit = Math.min(
          100,
          Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24),
        );
        const skip = (page - 1) * limit;

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const match: Record<string, unknown> = { user_id: userObjectId };
        if (search) match.title = { $regex: escapeRegex(search), $options: "i" };
        if (mediaType && allowedTypes.has(mediaType))
          match.media_type = mediaType;
        if (status && allowedStatuses.has(status)) match.status = status;

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
          { $project: { progress_pct: 0 } },
        ];

        const [items, total] = await Promise.all([
          MediaItem.aggregate(pipeline),
          MediaItem.countDocuments(match),
        ]);

        return jsonOk(res, {
          items,
          total,
          page,
          limit,
          has_more: skip + items.length < total,
        });
      }
      case "POST": {
        const isBulkDelete = String(req.query.bulk_delete || "") === "1";
        if (isBulkDelete) {
          const bulkDeleteLimit = await checkRateLimit(
            `media:bulk_delete:${userId}:${ip}`,
            40,
            15 * 60 * 1000,
          );
          if (!bulkDeleteLimit.allowed) {
            logSecurityEvent("rate_limit_block", {
              route: "media",
              method: "POST",
              op: "bulk_delete",
              ip,
              user_id: userId,
              retry_after_sec: bulkDeleteLimit.retryAfterSec,
            });
            return jsonError(
              res,
              "RATE_LIMITED",
              `Too many bulk delete requests. Retry in ${bulkDeleteLimit.retryAfterSec}s`,
              429,
            );
          }

          const parsed = req.body || {};
          const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
          if (ids.length === 0) {
            return jsonError(
              res,
              "INVALID_BULK_PAYLOAD",
              "ids must be a non-empty array",
              400,
            );
          }
          if (ids.length > 500) {
            return jsonError(
              res,
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
              res,
              "INVALID_BULK_PAYLOAD",
              "No valid ids provided",
              400,
            );
          }

          const result = await MediaItem.deleteMany({
            _id: { $in: objectIds },
            user_id: userId,
          });
          return jsonOk(res, {
            deleted: Number(result.deletedCount || 0),
            requested: ids.length,
          });
        }

        const postLimit = await checkRateLimit(
          `media:post:${userId}:${ip}`,
          600,
          15 * 60 * 1000,
        );
        if (!postLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "POST",
            ip,
            user_id: userId,
            retry_after_sec: postLimit.retryAfterSec,
          });
          return jsonError(
            res,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${postLimit.retryAfterSec}s`,
            429,
          );
        }

        const isBulk = String(req.query.bulk || "") === "1";
        const parsed = req.body || {};

        if (isBulk) {
          if (!Array.isArray(parsed)) {
            return jsonError(
              res,
              "INVALID_BULK_PAYLOAD",
              "Bulk payload must be an array",
              400,
            );
          }
          if (parsed.length === 0) {
            return jsonOk(res, { inserted: 0, skipped: 0 });
          }
          if (parsed.length > 200) {
            return jsonError(
              res,
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
              user_id: userId,
              last_updated: new Date(),
            });
          }

          if (docs.length === 0) {
            return jsonOk(res, { inserted: 0, skipped });
          }

          const insertedDocs = await MediaItem.insertMany(docs, {
            ordered: false,
          });
          return jsonOk(res, { inserted: insertedDocs.length, skipped }, 201);
        }

        const raw = parsed as MediaPayload;
        const validated = validatePayload(raw, false);
        if (!validated.ok) {
          return jsonError(
            res,
            "INVALID_MEDIA_PAYLOAD",
            validated.message,
            400,
          );
        }

        const duplicateMode = String(req.query.duplicate_mode || "reject");
        const normalizedTitle = String(validated.normalized.title || "")
          .trim()
          .replace(/\s+/g, " ");
        const normalizedType = String(validated.normalized.media_type || "");
        const duplicate = await MediaItem.findOne({
          user_id: userId,
          media_type: normalizedType,
          title: {
            $regex: `^${escapeRegex(normalizedTitle)}$`,
            $options: "i",
          },
        });

        if (duplicate && duplicateMode !== "keep_both") {
          if (duplicateMode === "merge") {
            const merged = await MediaItem.findOneAndUpdate(
              { _id: duplicate._id, user_id: userId },
              { ...validated.normalized, last_updated: new Date() },
              { new: true },
            );
            if (!merged) {
              return jsonError(res, "NOT_FOUND", "Not found", 404);
            }
            return jsonOk(res, { merged: true, item: merged });
          }
          return jsonError(
            res,
            "DUPLICATE_TITLE",
            "A similar title already exists for this type. Merge or keep both?",
            409,
          );
        }

        const newItem = await MediaItem.create({
          ...validated.normalized,
          user_id: userId,
          last_updated: new Date(),
        });
        return jsonOk(res, newItem, 201);
      }
      case "PUT": {
        const putLimit = await checkRateLimit(
          `media:put:${userId}:${ip}`,
          180,
          15 * 60 * 1000,
        );
        if (!putLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "PUT",
            ip,
            user_id: userId,
            retry_after_sec: putLimit.retryAfterSec,
          });
          return jsonError(
            res,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${putLimit.retryAfterSec}s`,
            429,
          );
        }
        if (!id) {
          return jsonError(res, "MISSING_ID", "Missing ID", 400);
        }
        const raw = (req.body || {}) as MediaPayload;
        const validated = validatePayload(raw, true);
        if (!validated.ok) {
          return jsonError(
            res,
            "INVALID_MEDIA_PAYLOAD",
            validated.message,
            400,
          );
        }

        const updated = await MediaItem.findOneAndUpdate(
          { _id: id, user_id: userId },
          validated.normalized,
          { new: true },
        );
        if (!updated) {
          return jsonError(res, "NOT_FOUND", "Not found", 404);
        }
        return jsonOk(res, updated);
      }
      case "DELETE": {
        const delLimit = await checkRateLimit(
          `media:delete:${userId}:${ip}`,
          80,
          15 * 60 * 1000,
        );
        if (!delLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "DELETE",
            ip,
            user_id: userId,
            retry_after_sec: delLimit.retryAfterSec,
          });
          return jsonError(
            res,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${delLimit.retryAfterSec}s`,
            429,
          );
        }
        if (!id) {
          return jsonError(res, "MISSING_ID", "Missing ID", 400);
        }
        const deleted = await MediaItem.findOneAndDelete({
          _id: id,
          user_id: userId,
        });
        if (!deleted) {
          return jsonError(res, "NOT_FOUND", "Not found", 404);
        }
        return jsonOk(res, { success: true });
      }
      default:
        return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }
  } catch (err) {
    logInternalError("media_handler_error", err, {
      route: "media",
      method: req.method || "unknown",
    });
    return jsonError(res, "MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
