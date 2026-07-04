import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { MediaItem } from "@/lib/models";
import {
  AnalyticsAggregationResult,
  buildAnalyticsPipeline,
  normalizeAnalyticsResult,
} from "@/lib/services/media/analytics";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const userObjectId = new mongoose.Types.ObjectId(userId!);
    const [result] = (await MediaItem.aggregate(
      buildAnalyticsPipeline(userObjectId),
    )) as AnalyticsAggregationResult[];

    return jsonOk(normalizeAnalyticsResult(result || {}));
  } catch (err) {
    logInternalError("analytics_handler_error", err, { route: "analytics" });
    return jsonError("ANALYTICS_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
