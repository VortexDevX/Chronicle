import mongoose from "mongoose";
import { MediaItem } from "@/lib/models";
import { fetchSimklAnimeCalendar, matchSimklEntries } from "@/lib/sources/simklCalendar";
import type { MediaItem as MediaItemType } from "@/types/media";

export async function getUpcomingReleases(
  userId: string | mongoose.Types.ObjectId,
  limit = 6,
  maxWindowMs = 3 * 86_400_000, // Next 3 days only
): Promise<MediaItemType[]> {
  const now = new Date();
  const maxReleaseTime = now.getTime() + maxWindowMs;
  try {
    const entries = await MediaItem.find({
      user_id: userId,
      status: { $in: ["Active", "Watching/Reading"] },
      media_type: { $in: ["Anime", "Donghua"] },
    })
      .select("title media_type status progress_current progress_total tracker_url custom_cover_url anilist_id simkl_id")
      .sort({ last_updated: -1 })
      .limit(300)
      .lean();

    if (!entries.length) return [];

    const { payload } = await fetchSimklAnimeCalendar();
    const { items } = matchSimklEntries(entries, payload, now);

    // Filter strictly to upcoming releases in the next 3 days
    const within3Days = items.filter((item) => {
      if (!item.next_episode_release_at || item.next_episode == null) return false;
      const releaseTime = Date.parse(item.next_episode_release_at);
      const isCaughtUp =
        Number(item.progress_current || 0) >= item.next_episode;
      return (
        !isNaN(releaseTime) &&
        releaseTime > now.getTime() &&
        !isCaughtUp &&
        releaseTime <= maxReleaseTime
      );
    });

    return within3Days.slice(0, limit) as unknown as MediaItemType[];
  } catch {
    // If SIMKL calendar fails or is offline, fallback to database entries with future dates within 3 days
    const nowIso = now.toISOString();
    const maxIso = new Date(maxReleaseTime).toISOString();
    const fallback = await MediaItem.find({
      user_id: userId,
      status: { $in: ["Active", "Watching/Reading"] },
      media_type: { $in: ["Anime", "Donghua"] },
      next_episode: { $ne: null },
      next_episode_release_at: { $gt: nowIso, $lte: maxIso },
      $expr: { $lt: ["$progress_current", "$next_episode"] },
    })
      .sort({ next_episode_release_at: 1 })
      .limit(limit)
      .lean();
    return fallback as unknown as MediaItemType[];
  }
}
