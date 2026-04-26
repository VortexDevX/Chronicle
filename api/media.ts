import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem } from "./_utils/db.js";
import mongoose from "mongoose";
import { getClientIp } from "./_utils/rateLimit.js";
import { requireAuthUserId, enforceRateLimit } from "./_utils/guards.js";
import { logInternalError } from "./_utils/log.js";
import { handleOptions, setCors, jsonOk, jsonError } from "./_utils/http.js";

type MediaPayload = {
  title?: string;
  media_type?: string;
  status?: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number;
  notes?: string;
  external_status?: "ongoing" | "completed" | "hiatus" | "cancelled" | null;
  read_url?: string | null;
  tracker_url?: string | null;
  mangadex_id?: string | null;
  custom_cover_url?: string | null;
};

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_URL_LENGTH = 500;

const allowedTypes = new Set(["Anime", "Manhwa", "Donghua", "Light Novel"]);
const allowedStatuses = new Set([
  "Planned",
  "Watching/Reading",
  "On Hold",
  "Dropped",
  "Completed",
]);
const allowedExternalStatuses = new Set([
  "ongoing",
  "completed",
  "hiatus",
  "cancelled",
]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

/**
 * Validate and normalize user-provided URLs used for client rendering.
 * Blocks localhost/private-network targets and non-http protocols.
 */
function normalizePublicHttpUrl(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      isPrivateIpv4(hostname)
    ) {
      return null;
    }

    const normalized = parsed.toString();
    if (normalized.length > MAX_URL_LENGTH) {
      return null;
    }
    return normalized;
  } catch {
    return null;
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

  // ── External tracking fields ─────────────────────────────────

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
      const url = normalizePublicHttpUrl(String(payload.read_url).trim());
      if (!url) {
        return {
          ok: false,
          message:
            "read_url must be a valid public http/https URL under 500 characters",
        };
      }
      normalized.read_url = url;
    }
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
      // Basic UUID-ish format check (MangaDex uses UUIDs)
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
  value: string | string[] | undefined,
  fallback = "",
): string {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || fallback);
  return raw.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
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
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const ip = getClientIp(req);

    const id = req.query.id as string | undefined;

    // Validate id if provided
    if (id && !isValidObjectId(id)) {
      return jsonError(res, "INVALID_ID", "Invalid ID format", 400);
    }

    switch (req.method) {
      case "GET": {
        const search = normalizeQueryValue(req.query.search);
        const mediaType = normalizeQueryValue(req.query.media_type);
        const status = normalizeQueryValue(req.query.status);
        const sortBy = normalizeQueryValue(req.query.sort_by, "last_updated");
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
          const bulkDeleteAllowed = await enforceRateLimit(req, res, {
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
          if (!bulkDeleteAllowed) return;

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

        const postAllowed = await enforceRateLimit(req, res, {
          key: `media:post:${userId}:${ip}`,
          limit: 3000,
          windowMs: 15 * 60 * 1000,
          strict: true,
          route: "media",
          method: "POST",
          userId,
          message: "Too many write requests. Please retry shortly.",
        });
        if (!postAllowed) return;

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
        const putAllowed = await enforceRateLimit(req, res, {
          key: `media:put:${userId}:${ip}`,
          limit: 3000,
          windowMs: 15 * 60 * 1000,
          strict: true,
          route: "media",
          method: "PUT",
          userId,
          message: "Too many write requests. Please retry shortly.",
        });
        if (!putAllowed) return;
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
        const deleteAllowed = await enforceRateLimit(req, res, {
          key: `media:delete:${userId}:${ip}`,
          limit: 3000,
          windowMs: 15 * 60 * 1000,
          strict: true,
          route: "media",
          method: "DELETE",
          userId,
          message: "Too many write requests. Please retry shortly.",
        });
        if (!deleteAllowed) return;
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
