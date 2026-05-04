import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { MediaItem } from "@/lib/models";
import { requireAuthUserId } from "@/lib/guards";
import { jsonOk, jsonError } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const { sourceId, targetId, action } = await req.json();

    if (!sourceId || !targetId || !mongoose.Types.ObjectId.isValid(sourceId) || !mongoose.Types.ObjectId.isValid(targetId)) {
      return jsonError("INVALID_IDS", "Valid source and target IDs are required", 400);
    }

    const sId = new mongoose.Types.ObjectId(sourceId);
    const tId = new mongoose.Types.ObjectId(targetId);
    const uId = new mongoose.Types.ObjectId(userId!);

    if (action === "link") {
      await MediaItem.updateOne({ _id: sId, user_id: uId }, { $addToSet: { linked_entries: tId } });
      await MediaItem.updateOne({ _id: tId, user_id: uId }, { $addToSet: { linked_entries: sId } });
    } else if (action === "unlink") {
      await MediaItem.updateOne({ _id: sId, user_id: uId }, { $pull: { linked_entries: tId } });
      await MediaItem.updateOne({ _id: tId, user_id: uId }, { $pull: { linked_entries: sId } });
    } else {
      return jsonError("INVALID_ACTION", "Action must be link or unlink", 400);
    }

    return jsonOk({ success: true });
  } catch (err) {
    logInternalError("media_link_error", err, { route: "media/link" });
    return jsonError("LINK_ERROR", "Internal server error", 500);
  }
}
