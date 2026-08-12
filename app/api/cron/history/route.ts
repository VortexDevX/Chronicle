import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { CronHistory } from "@/lib/models";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const QUERY_TIMEOUT_MS = 5_000;

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || "");
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(MAX_LIMIT, Math.floor(requestedLimit))
      : DEFAULT_LIMIT;

    const items = await CronHistory.find({
      user_id: new mongoose.Types.ObjectId(userId!),
    })
      .select("-user_id -expires_at")
      .sort({ started_at: -1, _id: -1 })
      .limit(limit)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean();

    return jsonOk({ items, retention_days: 30 });
  } catch (err) {
    logInternalError("cron_history_error", err, { route: "cron/history" });
    return jsonError("CRON_HISTORY_ERROR", "Failed to load cron history", 500);
  }
}
