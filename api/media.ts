import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem } from "./utils/db";
import { verifyToken } from "./utils/auth";
import mongoose from "mongoose";
import { checkRateLimit, getClientIp } from "./utils/rateLimit";
import { logInternalError, logSecurityEvent } from "./utils/log";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await connectDB();
    const userId = verifyToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ code: "UNAUTHORIZED", message: "Unauthorized" });
    const ip = getClientIp(req);

    const id = req.query.id as string | undefined;

    switch (req.method) {
      case "GET": {
        const search = String(req.query.search || "").trim();
        const mediaType = String(req.query.media_type || "").trim();
        const status = String(req.query.status || "").trim();
        const sortBy = String(req.query.sort_by || "last_updated");
        const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
        const limit = Math.min(
          100,
          Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24),
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

        return res.status(200).json({
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
            return res.status(429).json({
              code: "RATE_LIMITED",
              message: `Too many bulk delete requests. Retry in ${bulkDeleteLimit.retryAfterSec}s`
            });
          }

          const parsed = req.body || {};
          const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
          if (ids.length === 0) {
            return res.status(400).json({ code: "INVALID_BULK_PAYLOAD", message: "ids must be a non-empty array" });
          }
          if (ids.length > 500) {
            return res.status(400).json({
              code: "BULK_LIMIT_EXCEEDED",
              message: "Bulk delete payload too large (max 500 ids per request)"
            });
          }

          const objectIds = ids
            .filter((x: string) => mongoose.Types.ObjectId.isValid(x))
            .map((x: string) => new mongoose.Types.ObjectId(x));
          if (objectIds.length === 0) {
            return res.status(400).json({ code: "INVALID_BULK_PAYLOAD", message: "No valid ids provided" });
          }

          const result = await MediaItem.deleteMany({
            _id: { $in: objectIds },
            user_id: userId,
          });
          return res.status(200).json({
            deleted: Number(result.deletedCount || 0),
            requested: ids.length,
          });
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
          return res.status(429).json({
            code: "RATE_LIMITED",
            message: `Too many write requests. Retry in ${postLimit.retryAfterSec}s`
          });
        }
        
        const isBulk = String(req.query.bulk || "") === "1";
        const parsed = req.body || {};

        if (isBulk) {
          if (!Array.isArray(parsed)) {
            return res.status(400).json({ code: "INVALID_BULK_PAYLOAD", message: "Bulk payload must be an array" });
          }
          if (parsed.length === 0) {
            return res.status(200).json({ inserted: 0, skipped: 0 });
          }
          if (parsed.length > 200) {
            return res.status(400).json({
              code: "BULK_LIMIT_EXCEEDED",
              message: "Bulk payload too large (max 200 items per request)"
            });
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
            return res.status(200).json({ inserted: 0, skipped });
          }

          const insertedDocs = await MediaItem.insertMany(docs, { ordered: false });
          return res.status(201).json({
            inserted: insertedDocs.length,
            skipped,
          });
        }

        const raw = parsed as MediaPayload;
        const validated = validatePayload(raw, false);
        if (!validated.ok) {
          return res.status(400).json({ code: "INVALID_MEDIA_PAYLOAD", message: validated.message });
        }

        const duplicateMode = String(req.query.duplicate_mode || "reject");
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
            if (!merged) return res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
            return res.status(200).json({ merged: true, item: merged });
          }
          return res.status(409).json({
            code: "DUPLICATE_TITLE",
            message: "A similar title already exists for this type. Merge or keep both?",
            existing_id: String(duplicate._id),
          });
        }

        const newItem = await MediaItem.create({
          ...validated.normalized,
          user_id: userId,
          last_updated: new Date(),
        });
        return res.status(201).json(newItem);
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
          return res.status(429).json({
            code: "RATE_LIMITED",
            message: `Too many write requests. Retry in ${putLimit.retryAfterSec}s`
          });
        }
        if (!id) return res.status(400).json({ code: "MISSING_ID", message: "Missing ID" });
        const raw = (req.body || {}) as MediaPayload;
        const validated = validatePayload(raw, true);
        if (!validated.ok) {
          return res.status(400).json({ code: "INVALID_MEDIA_PAYLOAD", message: validated.message });
        }

        const updated = await MediaItem.findOneAndUpdate(
          { _id: id, user_id: userId },
          validated.normalized,
          { new: true },
        );
        if (!updated) return res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
        return res.status(200).json(updated);
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
          return res.status(429).json({
            code: "RATE_LIMITED",
            message: `Too many write requests. Retry in ${delLimit.retryAfterSec}s`
          });
        }
        if (!id) return res.status(400).json({ code: "MISSING_ID", message: "Missing ID" });
        const deleted = await MediaItem.findOneAndDelete({
          _id: id,
          user_id: userId,
        });
        if (!deleted) return res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
        return res.status(200).json({ success: true });
      }
      default:
        return res.status(405).json({ code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" });
    }
  } catch (err) {
    logInternalError("media_handler_error", err, {
      route: "media",
      method: req.method || "unknown",
    });
    return res.status(500).json({ code: "MEDIA_INTERNAL_ERROR", message: "Internal Server Error" });
  }
}
