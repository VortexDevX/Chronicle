import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { MediaItem } from "@/lib/models";
import mongoose from "mongoose";
import { getClientIp } from "@/lib/rateLimit";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { logInternalError } from "@/lib/log";
import { jsonOk, jsonError } from "@/lib/http";
import {
  buildTitleKey,
  MediaPayload,
  validateMediaPayload,
} from "@/lib/services/media/validation";
import {
  buildMediaMatch,
  buildMediaSortStage,
  escapeRegex,
  parseMediaListParams,
} from "@/lib/services/media/query";
import {
  isDuplicateKeyError,
  mediaIdentityKey,
  prepareBulkMediaDocs,
} from "@/lib/services/media/bulkImport";

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const userObjectId = new mongoose.Types.ObjectId(userId!);
    const params = parseMediaListParams(req.nextUrl.searchParams);
    const match = buildMediaMatch(params, userObjectId);
    const sortStage = buildMediaSortStage(params.sortBy);

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
      { $skip: params.skip },
      { $limit: params.limit },
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
      page: params.page,
      limit: params.limit,
      has_more: params.skip + items.length < total,
    });
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "GET" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
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

      const firstPass = prepareBulkMediaDocs(
        parsed as MediaPayload[],
        userObjectId,
      );
      const candidateTypes = Array.from(
        new Set(
          firstPass.docs
            .map((doc) => String(doc.media_type || ""))
            .filter(Boolean),
        ),
      );

      const existing =
        candidateTypes.length > 0
          ? await MediaItem.find({
              user_id: userObjectId,
              media_type: { $in: candidateTypes },
            })
              .select("title media_type dedupe_key")
              .lean()
          : [];

      const existingKeys = new Set(
        existing
          .map((item) => {
            const titleKey = String(item.dedupe_key || item.title || "");
            return titleKey
              ? mediaIdentityKey(String(item.media_type || ""), titleKey)
              : null;
          })
          .filter((key): key is string => Boolean(key)),
      );
      const { docs, skipped } = prepareBulkMediaDocs(
        parsed as MediaPayload[],
        userObjectId,
        existingKeys,
      );

      if (docs.length === 0) {
        return jsonOk({ inserted: 0, skipped });
      }

      try {
        const insertedDocs = await MediaItem.insertMany(docs, {
          ordered: false,
        });
        return jsonOk({ inserted: insertedDocs.length, skipped }, 201);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          return jsonError(
            "DUPLICATE_TITLE",
            "One or more imported titles already exist for this type.",
            409,
          );
        }
        throw err;
      }
    }

    const raw = parsed as MediaPayload;
    const validated = validateMediaPayload(raw, false);
    if (!validated.ok) {
      return jsonError("INVALID_MEDIA_PAYLOAD", validated.message, 400);
    }

    const duplicateMode = String(searchParams.get("duplicate_mode") || "reject");
    const normalizedTitle = String(validated.normalized.title || "")
      .trim()
      .replace(/\s+/g, " ");
    const normalizedType = String(validated.normalized.media_type || "");
    const dedupeKey = buildTitleKey(normalizedTitle);
    const duplicate = await MediaItem.findOne({
      user_id: userObjectId,
      media_type: normalizedType,
      $or: [
        { dedupe_key: dedupeKey },
        {
          title: {
            $regex: `^${escapeRegex(normalizedTitle)}$`,
            $options: "i",
          },
        },
      ],
    });

    if (duplicate && duplicateMode !== "keep_both") {
      if (duplicateMode === "merge") {
        const merged = await MediaItem.findOneAndUpdate(
          { _id: duplicate._id, user_id: userObjectId },
          {
            ...validated.normalized,
            dedupe_key: dedupeKey,
            last_updated: new Date(),
          },
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

    try {
      const newItem = await MediaItem.create({
        ...validated.normalized,
        dedupe_key: duplicateMode === "keep_both" ? null : dedupeKey,
        user_id: userObjectId,
        last_updated: new Date(),
      });
      return jsonOk(newItem, 201);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return jsonError(
          "DUPLICATE_TITLE",
          "A similar title already exists for this type. Merge or keep both?",
          409,
        );
      }
      throw err;
    }
  } catch (err) {
    logInternalError("media_handler_error", err, { route: "media", method: "POST" });
    return jsonError("MEDIA_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
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
    const validated = validateMediaPayload(raw, true);
    if (!validated.ok) {
      return jsonError("INVALID_MEDIA_PAYLOAD", validated.message, 400);
    }

    const updateDoc: Record<string, unknown> = { ...validated.normalized };
    if (
      validated.normalized.title !== undefined ||
      validated.normalized.media_type !== undefined
    ) {
      const existing = (await MediaItem.findOne({
        _id: id,
        user_id: userObjectId,
      })
        .select("title media_type dedupe_key")
        .lean()) as {
        title: string;
        media_type: string;
        dedupe_key?: string | null;
      } | null;
      if (!existing) {
        return jsonError("NOT_FOUND", "Not found", 404);
      }

      const nextTitle = String(validated.normalized.title || existing.title);
      const nextType = String(
        validated.normalized.media_type || existing.media_type,
      );
      const nextDedupeKey =
        existing.dedupe_key === null ? null : buildTitleKey(nextTitle);

      if (nextDedupeKey) {
        const duplicate = await MediaItem.findOne({
          _id: { $ne: id },
          user_id: userObjectId,
          media_type: nextType,
          $or: [
            { dedupe_key: nextDedupeKey },
            {
              title: {
                $regex: `^${escapeRegex(nextTitle)}$`,
                $options: "i",
              },
            },
          ],
        }).select("_id");
        if (duplicate) {
          return jsonError(
            "DUPLICATE_TITLE",
            "A similar title already exists for this type.",
            409,
          );
        }
      }

      updateDoc.dedupe_key = nextDedupeKey;
    }

    let updated;
    try {
      updated = await MediaItem.findOneAndUpdate(
        { _id: id, user_id: userObjectId },
        updateDoc,
        { new: true },
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return jsonError(
          "DUPLICATE_TITLE",
          "A similar title already exists for this type.",
          409,
        );
      }
      throw err;
    }
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
    const { userId, errorResponse } = await requireAuthUserId(req);
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
