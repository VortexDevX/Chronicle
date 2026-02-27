import { Handler } from "@netlify/functions";
import { connectDB, MediaItem } from "./utils/db";
import { verifyToken } from "./utils/auth";
import mongoose from "mongoose";
import { checkRateLimit, getClientIp } from "./utils/rateLimit";
import { logInternalError, logSecurityEvent } from "./utils/log";

function error(statusCode: number, code: string, message: string) {
  return { statusCode, body: JSON.stringify({ code, message }) };
}

type MediaPayload = {
  title?: string;
  media_type?: string;
  status?: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number;
  notes?: string;
};

const allowedTypes = new Set(["Anime", "Manhwa", "Donghua", "Light Novel"]);
const allowedStatuses = new Set([
  "Planned",
  "Watching/Reading",
  "On Hold",
  "Dropped",
  "Completed",
]);

function validatePayload(payload: MediaPayload, partial = false) {
  const normalized: MediaPayload = {};

  if (!partial || payload.title !== undefined) {
    const title = String(payload.title || "").trim();
    if (!title) return { ok: false, message: "Title is required" };
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
  const totalForCheck = normalized.progress_total ?? payload.progress_total ?? 0;
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
    normalized.notes = String(payload.notes || "").trim();
  }

  return { ok: true, normalized };
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const handler: Handler = async (event) => {
  try {
    await connectDB();
    const userId = verifyToken(event.headers.authorization);
    if (!userId) return error(401, "UNAUTHORIZED", "Unauthorized");
    const ip = getClientIp(event.headers);

    const id = event.queryStringParameters?.id;

    switch (event.httpMethod) {
      case "GET": {
        const params = event.queryStringParameters || {};
        const search = String(params.search || "").trim();
        const mediaType = String(params.media_type || "").trim();
        const status = String(params.status || "").trim();
        const sortBy = String(params.sort_by || "last_updated");
        const page = Math.max(1, parseInt(String(params.page || "1"), 10) || 1);
        const limit = Math.min(
          100,
          Math.max(1, parseInt(String(params.limit || "24"), 10) || 24),
        );
        const skip = (page - 1) * limit;

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const match: Record<string, unknown> = { user_id: userObjectId };
        if (search) match.title = { $regex: search, $options: "i" };
        if (mediaType && allowedTypes.has(mediaType)) match.media_type = mediaType;
        if (status && allowedStatuses.has(status)) match.status = status;

        const sortStage: Record<string, 1 | -1> =
          sortBy === "title"
            ? { title: 1 }
            : sortBy === "rating"
              ? { rating: -1, last_updated: -1 }
              : sortBy === "progress"
                ? { progress_pct: -1, last_updated: -1 }
                : { last_updated: -1 };

        const pipeline: Record<string, unknown>[] = [
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

        return {
          statusCode: 200,
          body: JSON.stringify({
            items,
            total,
            page,
            limit,
            has_more: skip + items.length < total,
          }),
        };
      }
      case "POST": {
        const isBulkDelete =
          String(event.queryStringParameters?.bulk_delete || "") === "1";
        if (isBulkDelete) {
          const bulkDeleteLimit = checkRateLimit(
            `media:bulk_delete:${userId}:${ip}`,
            40,
            15 * 60 * 1000
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
            return error(
              429,
              "RATE_LIMITED",
              `Too many bulk delete requests. Retry in ${bulkDeleteLimit.retryAfterSec}s`
            );
          }

          const parsed = JSON.parse(event.body || "{}") as { ids?: string[] };
          const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
          if (ids.length === 0) {
            return error(400, "INVALID_BULK_PAYLOAD", "ids must be a non-empty array");
          }
          if (ids.length > 500) {
            return error(
              400,
              "BULK_LIMIT_EXCEEDED",
              "Bulk delete payload too large (max 500 ids per request)"
            );
          }

          const objectIds = ids
            .filter((x) => mongoose.Types.ObjectId.isValid(x))
            .map((x) => new mongoose.Types.ObjectId(x));
          if (objectIds.length === 0) {
            return error(400, "INVALID_BULK_PAYLOAD", "No valid ids provided");
          }

          const result = await MediaItem.deleteMany({
            _id: { $in: objectIds },
            user_id: userId,
          });
          return {
            statusCode: 200,
            body: JSON.stringify({
              deleted: Number(result.deletedCount || 0),
              requested: ids.length,
            }),
          };
        }

        const postLimit = checkRateLimit(
          `media:post:${userId}:${ip}`,
          600,
          15 * 60 * 1000
        );
        if (!postLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "POST",
            ip,
            user_id: userId,
            retry_after_sec: postLimit.retryAfterSec,
          });
          return error(
            429,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${postLimit.retryAfterSec}s`
          );
        }
        const isBulk = String(event.queryStringParameters?.bulk || "") === "1";
        const parsed = JSON.parse(event.body || "{}");

        if (isBulk) {
          if (!Array.isArray(parsed)) {
            return error(400, "INVALID_BULK_PAYLOAD", "Bulk payload must be an array");
          }
          if (parsed.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ inserted: 0, skipped: 0 }) };
          }
          if (parsed.length > 200) {
            return error(
              400,
              "BULK_LIMIT_EXCEEDED",
              "Bulk payload too large (max 200 items per request)"
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
            return { statusCode: 200, body: JSON.stringify({ inserted: 0, skipped }) };
          }

          const insertedDocs = await MediaItem.insertMany(docs, { ordered: false });
          return {
            statusCode: 201,
            body: JSON.stringify({
              inserted: insertedDocs.length,
              skipped,
            }),
          };
        }

        const raw = parsed as MediaPayload;
        const validated = validatePayload(raw, false);
        if (!validated.ok) {
          return error(400, "INVALID_MEDIA_PAYLOAD", validated.message);
        }

        const duplicateMode = String(
          event.queryStringParameters?.duplicate_mode || "reject"
        );
        const normalizedTitle = String(validated.normalized.title || "").trim();
        const normalizedType = String(validated.normalized.media_type || "");
        const duplicate = await MediaItem.findOne({
          user_id: userId,
          media_type: normalizedType,
          title: { $regex: `^${escapeRegex(normalizedTitle)}$`, $options: "i" },
        });

        if (duplicate && duplicateMode !== "keep_both") {
          if (duplicateMode === "merge") {
            const merged = await MediaItem.findOneAndUpdate(
              { _id: duplicate._id, user_id: userId },
              { ...validated.normalized, last_updated: new Date() },
              { new: true }
            );
            if (!merged) return error(404, "NOT_FOUND", "Not found");
            return {
              statusCode: 200,
              body: JSON.stringify({ merged: true, item: merged }),
            };
          }
          return {
            statusCode: 409,
            body: JSON.stringify({
              code: "DUPLICATE_TITLE",
              message:
                "A similar title already exists for this type. Merge or keep both?",
              existing_id: String(duplicate._id),
            }),
          };
        }

        const newItem = await MediaItem.create({
          ...validated.normalized,
          user_id: userId,
          last_updated: new Date(),
        });
        return { statusCode: 201, body: JSON.stringify(newItem) };
      }
      case "PUT": {
        const putLimit = checkRateLimit(
          `media:put:${userId}:${ip}`,
          180,
          15 * 60 * 1000
        );
        if (!putLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "PUT",
            ip,
            user_id: userId,
            retry_after_sec: putLimit.retryAfterSec,
          });
          return error(
            429,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${putLimit.retryAfterSec}s`
          );
        }
        if (!id) return error(400, "MISSING_ID", "Missing ID");
        const raw = JSON.parse(event.body || "{}") as MediaPayload;
        const validated = validatePayload(raw, true);
        if (!validated.ok) {
          return error(400, "INVALID_MEDIA_PAYLOAD", validated.message);
        }

        const updated = await MediaItem.findOneAndUpdate(
          { _id: id, user_id: userId },
          validated.normalized,
          { new: true },
        );
        if (!updated) return error(404, "NOT_FOUND", "Not found");
        return { statusCode: 200, body: JSON.stringify(updated) };
      }
      case "DELETE": {
        const delLimit = checkRateLimit(
          `media:delete:${userId}:${ip}`,
          80,
          15 * 60 * 1000
        );
        if (!delLimit.allowed) {
          logSecurityEvent("rate_limit_block", {
            route: "media",
            method: "DELETE",
            ip,
            user_id: userId,
            retry_after_sec: delLimit.retryAfterSec,
          });
          return error(
            429,
            "RATE_LIMITED",
            `Too many write requests. Retry in ${delLimit.retryAfterSec}s`
          );
        }
        if (!id) return error(400, "MISSING_ID", "Missing ID");
        const deleted = await MediaItem.findOneAndDelete({
          _id: id,
          user_id: userId,
        });
        if (!deleted) return error(404, "NOT_FOUND", "Not found");
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }
      default:
        return error(405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
    }
  } catch (err) {
    logInternalError("media_handler_error", err, {
      route: "media",
      method: event.httpMethod || "unknown",
    });
    return error(500, "MEDIA_INTERNAL_ERROR", "Internal Server Error");
  }
};
