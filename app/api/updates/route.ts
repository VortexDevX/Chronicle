import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { getUpdateFeed } from "@/lib/services/media/updateFeedQuery";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const payload = await getUpdateFeed(new mongoose.Types.ObjectId(userId!));
    return jsonOk(payload);
  } catch (err) {
    logInternalError("updates_handler_error", err, { route: "updates" });
    return jsonError("UPDATES_INTERNAL_ERROR", "Failed to load updates", 500);
  }
}
