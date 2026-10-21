import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { MediaItem } from "@/lib/models";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const match = {
      user_id: new mongoose.Types.ObjectId(userId!),
      media_type: "Manhwa",
      $or: [
        { mangadex_id: { $exists: false } },
        { mangadex_id: null },
        { mangadex_id: "" },
        { mangadex_id: /^\s*$/ },
      ],
    };
    const [items, total] = await Promise.all([
      MediaItem.find(match).select("title").sort({ title: 1 }).limit(1000).lean(),
      MediaItem.countDocuments(match),
    ]);

    return jsonOk({
      items: items.map((item) => ({ _id: String(item._id), title: String(item.title) })),
      total,
    });
  } catch (err) {
    logInternalError("missing_mangadex_cover_audit_error", err, {
      route: "media/missing-mangadex",
      method: "GET",
    });
    return jsonError("COVER_AUDIT_FAILED", "Could not check Manhwa cover IDs", 500);
  }
}
