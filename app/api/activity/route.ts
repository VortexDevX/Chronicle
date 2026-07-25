import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { getActivitySnapshot } from "@/lib/services/activity/query";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const activity = await getActivitySnapshot(
      new mongoose.Types.ObjectId(userId!),
    );
    return jsonOk(activity);
  } catch (err) {
    logInternalError("activity_handler_error", err, { route: "activity" });
    return jsonError("ACTIVITY_INTERNAL_ERROR", "Failed to load activity", 500);
  }
}
