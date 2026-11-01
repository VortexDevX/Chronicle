import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { MediaItem } from "@/lib/models";
import { getUpdateFeed } from "@/lib/services/media/updateFeedQuery";
import { getActivitySnapshot } from "@/lib/services/activity/query";
import { sampleActiveMedia } from "@/lib/services/media/featured";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { userId, errorResponse } = await requireAuthUserId(request);
    if (!userId && errorResponse) return errorResponse;

    const userObjectId = new mongoose.Types.ObjectId(userId!);
    const activeFilter = {
      user_id: userObjectId,
      status: { $in: ["Active", "Watching/Reading"] },
    };

    const [activeItems, optionalResults] = await Promise.all([
      MediaItem.find(activeFilter).sort({ last_updated: -1, _id: 1 }).limit(6).lean(),
      Promise.allSettled([
        getUpdateFeed(userObjectId, 4),
        getActivitySnapshot(userObjectId, 6),
        sampleActiveMedia(userObjectId),
      ]),
    ]);

    const [updatesResult, activityResult, featuredResult] = optionalResults;
    const continueItems = activeItems;
    const featured = (featuredResult.status === "fulfilled" ? featuredResult.value : null) ?? continueItems[0] ?? null;
    const partialFailures: string[] = [];
    if (featuredResult.status === "rejected") partialFailures.push("featured rotation");

    const updates =
      updatesResult.status === "fulfilled"
        ? updatesResult.value
        : (partialFailures.push("updates"), { items: [], tracker_errors: [] });
    const activity =
      activityResult.status === "fulfilled"
        ? activityResult.value
        : (partialFailures.push("seven-day activity"), { events: [], days: [] });

    return jsonOk({
      featured,
      continue_items: continueItems,
      upcoming_releases: [],
      updates: updates.items,
      activity: activity.events,
      rhythm: activity.days,
      ...(partialFailures.length ? { partial_failures: partialFailures } : {}),
    });
  } catch (error) {
    logInternalError("home_handler_error", error, { route: "home" });
    return jsonError("HOME_INTERNAL_ERROR", "Failed to load Home", 500);
  }
}
