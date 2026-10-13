import mongoose from "mongoose";
import { MediaItem } from "@/lib/models";
import {
  fetchAniListMediaBatch,
  formatAniListSchedule,
} from "@/lib/sources/anilistAiring";
import { resolveAiringCalendarSchedule } from "@/lib/sources/airingCalendar";
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
      $or: [
        { media_type: "Anime" },
        { media_type: "Donghua" },
      ],
    })
      .select("title media_type status progress_current progress_total tracker_url custom_cover_url anilist_id simkl_id next_episode next_episode_release_at")
      .sort({ last_updated: -1 })
      .limit(300)
      .lean();

    if (!entries.length) return [];

    const anilistIds = entries
      .map((e) => Number(e.anilist_id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const mediaMap = anilistIds.length > 0 ? await fetchAniListMediaBatch(anilistIds) : new Map();

    const matchedItems: MediaItemType[] = [];

    for (const entry of entries) {
      const anilistId = Number(entry.anilist_id);
      const media = anilistId ? mediaMap.get(anilistId) : null;
      let nextEpisode = entry.next_episode ?? null;
      let nextReleaseAtStr = entry.next_episode_release_at
        ? new Date(entry.next_episode_release_at).toISOString()
        : null;

      if (media) {
        const schedule = formatAniListSchedule(media);
        if (schedule.nextEpisode && schedule.nextReleaseAt) {
          nextEpisode = schedule.nextEpisode;
          nextReleaseAtStr = schedule.nextReleaseAt.toISOString();
        }
      }

      if (!nextEpisode || !nextReleaseAtStr) {
        const fallback = await resolveAiringCalendarSchedule({
          anilist_id: entry.anilist_id,
          simkl_id: (entry as { simkl_id?: number }).simkl_id,
          title: entry.title,
        });
        if (fallback) {
          nextEpisode = fallback.nextEpisode;
          nextReleaseAtStr = fallback.nextReleaseAt.toISOString();
        }
      }

      if (nextEpisode !== null && nextReleaseAtStr !== null) {
        const releaseTime = Date.parse(nextReleaseAtStr);
        const isCaughtUp = Number(entry.progress_current || 0) >= nextEpisode;

        if (
          !isNaN(releaseTime) &&
          releaseTime > now.getTime() &&
          !isCaughtUp &&
          releaseTime <= maxReleaseTime
        ) {
          matchedItems.push({
            ...entry,
            _id: String(entry._id),
            next_episode: nextEpisode,
            next_episode_release_at: nextReleaseAtStr,
          } as unknown as MediaItemType);
        }
      }
    }

    matchedItems.sort((a, b) => {
      const timeA = a.next_episode_release_at ? Date.parse(a.next_episode_release_at) : 0;
      const timeB = b.next_episode_release_at ? Date.parse(b.next_episode_release_at) : 0;
      return timeA - timeB;
    });

    return matchedItems.slice(0, limit);
  } catch {
    // If AniList query fails, fallback to stored database entries with future dates within 3 days
    const nowIso = now.toISOString();
    const maxIso = new Date(maxReleaseTime).toISOString();
    const fallback = await MediaItem.find({
      user_id: userId,
      status: { $in: ["Active", "Watching/Reading"] },
      $or: [
        { media_type: "Anime" },
        { media_type: "Donghua" },
      ],
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
