import mongoose from "mongoose";
import { MediaItem } from "@/lib/models";
import { toUpdateFeedItem } from "@/lib/services/media/updateFeed";
import type { MediaItem as MediaItemType, UpdatesPayload } from "@/types/media";

export async function getUpdateFeed(
  userObjectId: mongoose.Types.ObjectId,
  itemLimit = 100,
): Promise<UpdatesPayload> {
  const activeStatuses = ["Active", "Watching/Reading"];
  const tracked = {
    user_id: userObjectId,
    status: { $in: activeStatuses },
    // Manhwa needs a tracker URL. Anime/Donghua progress comes from SIMKL and
    // must remain visible even when Watch URL is empty.
    $or: [
      { media_type: "Manhwa", tracker_url: { $exists: true, $nin: [null, ""] } },
      { media_type: { $in: ["Anime", "Donghua"] } },
    ],
  };

  const [unreadResult, trackerErrorsResult] = await Promise.allSettled([
    MediaItem.find({
      ...tracked,
      $expr: {
        $gt: [
          { $ifNull: ["$latest_remote_progress", "$progress_current"] },
          "$progress_current",
        ],
      },
    })
      .sort({ last_checked_at: -1, last_updated: -1 })
      .limit(itemLimit)
      .lean(),
    MediaItem.find({
      ...tracked,
      last_scrape_status: "error",
    })
      .sort({ last_checked_at: -1 })
      .limit(20)
      .lean(),
  ]);
  const partialFailures: string[] = [];
  const unread =
    unreadResult.status === "fulfilled"
      ? unreadResult.value
      : (partialFailures.push("unread updates"), []);
  const trackerErrors =
    trackerErrorsResult.status === "fulfilled"
      ? trackerErrorsResult.value
      : (partialFailures.push("tracker health"), []);

  return {
    items: (unread as unknown as MediaItemType[]).map(toUpdateFeedItem),
    tracker_errors: trackerErrors as unknown as MediaItemType[],
    ...(partialFailures.length ? { partial_failures: partialFailures } : {}),
  };
}
