import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem } from "./_utils/db.js";
import { verifyToken } from "./_utils/auth.js";
import mongoose from "mongoose";
import { handleOptions, setCors, jsonOk, jsonError } from "./_utils/http.js";
import { logInternalError } from "./_utils/log.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  try {
    await connectDB();
    const userId = verifyToken(req.headers.authorization);
    if (!userId) {
      return jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const pipeline: mongoose.PipelineStage[] = [
      { $match: { user_id: userObjectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          watching: {
            $sum: { $cond: [{ $eq: ["$status", "Watching/Reading"] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
          },
          planned: {
            $sum: { $cond: [{ $eq: ["$status", "Planned"] }, 1, 0] },
          },
          onHold: {
            $sum: { $cond: [{ $eq: ["$status", "On Hold"] }, 1, 0] },
          },
          dropped: {
            $sum: { $cond: [{ $eq: ["$status", "Dropped"] }, 1, 0] },
          },
          ratingSum: {
            $sum: { $cond: [{ $ifNull: ["$rating", false] }, "$rating", 0] },
          },
          ratingCount: {
            $sum: { $cond: [{ $ifNull: ["$rating", false] }, 1, 0] },
          },
          // Aggregate counts by type into an array
          types: {
            $push: "$media_type"
          }
        },
      },
    ];

    const result = await MediaItem.aggregate(pipeline);

    if (result.length === 0) {
      return jsonOk(res, {
        total: 0,
        watching: 0,
        completed: 0,
        planned: 0,
        onHold: 0,
        dropped: 0,
        avgRating: "—",
        byType: {},
      });
    }

    const {
      total,
      watching,
      completed,
      planned,
      onHold,
      dropped,
      ratingSum,
      ratingCount,
      types
    } = result[0];

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";

    const byType: Record<string, number> = {};
    for (const t of (types || [])) {
      if (t) byType[t] = (byType[t] || 0) + 1;
    }

    return jsonOk(res, {
      total,
      watching,
      completed,
      planned,
      onHold,
      dropped,
      avgRating,
      byType,
    });
  } catch (err) {
    logInternalError("stats_handler_error", err, {
      route: "stats",
      method: req.method || "unknown",
    });
    return jsonError(res, "STATS_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
