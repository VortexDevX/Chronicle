import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { sampleActiveMedia } from "@/lib/services/media/featured";

export async function GET(request: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(request);
    if (!userId && errorResponse) return errorResponse;
    const exclude = request.nextUrl.searchParams.get("exclude") || undefined;
    if (exclude && !/^[a-f\d]{24}$/i.test(exclude)) return jsonError("INVALID_MEDIA_ID", "Invalid story ID", 400);
    const featured = await sampleActiveMedia(new mongoose.Types.ObjectId(userId!), exclude);
    const response = jsonOk({ featured });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    logInternalError("featured_media_error", error, { route: "home/featured" });
    return jsonError("FEATURED_MEDIA_ERROR", "Could not load another story. Try again.", 500);
  }
}
