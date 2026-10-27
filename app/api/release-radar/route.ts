import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { MediaItem } from "@/lib/models";
import {
  fetchAniListMediaBatch,
  formatAniListSchedule,
  AiringScheduleState,
} from "@/lib/sources/anilistAiring";
import { resolveAiringCalendarSchedule } from "@/lib/sources/airingCalendar";
import { isCaughtUpToRelease } from "@/lib/services/media/progressBridge";

export type RadarItem = {
  _id: string;
  title: string;
  media_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  numbering_mode?: "continuous" | "seasonal" | "unspecified" | null;
  season_number?: number | null;
  episode_offset?: number | null;
  tracker_url: string | null;
  custom_cover_url: string | null;
  anilist_id: number | null;
  schedule_state: AiringScheduleState;
  next_episode: number | null;
  next_episode_release_at: string | null;
  episode_title: string | null;
  poster_url: string | null;
};

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const entries = await MediaItem.find({
      user_id: userId,
      status: "Active",
      $or: [
        { media_type: "Anime" },
        { media_type: "Donghua" },
      ],
    })
      .select("title media_type status progress_current progress_total tracker_url custom_cover_url anilist_id simkl_id next_episode next_episode_release_at numbering_mode season_number episode_offset")
      .sort({ last_updated: -1 })
      .limit(300)
      .lean();

    const anilistIds = entries
      .map((e) => Number(e.anilist_id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const mediaMap = anilistIds.length > 0 ? await fetchAniListMediaBatch(anilistIds) : new Map();

    const items: RadarItem[] = [];
    const updatesToPersist: Promise<unknown>[] = [];
    const nowMs = Date.now();
    const recentWindowMs = 3 * 86_400_000;

    for (const entry of entries) {
      const anilistId = Number(entry.anilist_id);
      const media = anilistId ? mediaMap.get(anilistId) : null;
      const entryOffset = (entry as { episode_offset?: number | null }).episode_offset || null;
      const entryMode = (entry as { numbering_mode?: "continuous" | "seasonal" | "unspecified" | null }).numbering_mode || null;
      const entrySimklId = (entry as { simkl_id?: number }).simkl_id;
      const userProgress = Number(entry.progress_current || 0);

      let scheduleState: AiringScheduleState = "SCHEDULE_PENDING";
      let nextEpisode = entry.next_episode ?? null;
      let nextReleaseAtStr = entry.next_episode_release_at
        ? new Date(entry.next_episode_release_at).toISOString()
        : null;
      let posterUrl = entry.custom_cover_url || null;

      if (media) {
        const schedule = formatAniListSchedule(media);
        scheduleState = schedule.state;
        posterUrl = schedule.posterUrl || posterUrl;

        if (schedule.nextEpisode && schedule.nextReleaseAt) {
          nextEpisode = schedule.nextEpisode;
          nextReleaseAtStr = schedule.nextReleaseAt.toISOString();
        }
      }

      // Check if existing episode is in recent past (< 3 days ago) and user has not caught up to it yet
      const existingTime = nextReleaseAtStr ? Date.parse(nextReleaseAtStr) : null;
      const isAiredRecently =
        existingTime !== null && !isNaN(existingTime) && existingTime <= nowMs && nowMs - existingTime <= recentWindowMs;
      const isUserCaughtUp = isCaughtUpToRelease({
        progressCurrent: userProgress,
        nextEpisode,
        numberingMode: entryMode,
        episodeOffset: entryOffset,
      });

      // If episode aired recently and user hasn't caught up, keep it visible as released/available
      const keepAiredEpisode = isAiredRecently && !isUserCaughtUp;

      // If AniList did not provide an upcoming episode date, or if it already aired and user caught up, query fallback calendar
      if (!keepAiredEpisode && (!nextEpisode || !nextReleaseAtStr || Date.parse(nextReleaseAtStr) <= nowMs)) {
        const fallback = await resolveAiringCalendarSchedule({
          anilist_id: entry.anilist_id,
          simkl_id: entrySimklId,
          title: entry.title,
        });

        if (fallback) {
          let matchedEpisode: number | null = null;
          let matchedReleaseAt: Date | null = null;

          // Check if previous episode aired recently and user is not caught up
          if (fallback.previousEpisode && fallback.previousReleaseAt) {
            const prevAiredMs = fallback.previousReleaseAt.getTime();
            const prevIsRecent = prevAiredMs <= nowMs && nowMs - prevAiredMs <= recentWindowMs;
            const isCaughtUpToPrev = isCaughtUpToRelease({
              progressCurrent: userProgress,
              nextEpisode: fallback.previousEpisode,
              numberingMode: entryMode,
              episodeOffset: entryOffset,
            });

            if (prevIsRecent && !isCaughtUpToPrev) {
              matchedEpisode = fallback.previousEpisode;
              matchedReleaseAt = fallback.previousReleaseAt;
            }
          }

          // Otherwise use upcoming next episode
          if (!matchedEpisode && fallback.nextEpisode && fallback.nextReleaseAt) {
            matchedEpisode = fallback.nextEpisode;
            matchedReleaseAt = fallback.nextReleaseAt;
          }

          if (matchedEpisode && matchedReleaseAt) {
            nextEpisode = matchedEpisode;
            nextReleaseAtStr = matchedReleaseAt.toISOString();
            scheduleState = "SCHEDULED";
            posterUrl = posterUrl || fallback.posterUrl;
          } else if (entry.next_episode && entry.next_episode_release_at) {
            // If the entry already had a scheduled date in the future, preserve it
            const preservedTime = new Date(entry.next_episode_release_at).getTime();
            if (preservedTime > nowMs) {
              nextEpisode = entry.next_episode;
              nextReleaseAtStr = new Date(entry.next_episode_release_at).toISOString();
              scheduleState = "SCHEDULED";
            }
          }

          // Save matched simkl_id if discovered
          if (fallback.simklId && !entrySimklId) {
            updatesToPersist.push(
              MediaItem.updateOne({ _id: entry._id }, { $set: { simkl_id: fallback.simklId } }),
            );
          }
        }
      } else if (keepAiredEpisode && nextEpisode && nextReleaseAtStr) {
        scheduleState = "SCHEDULED";
      }

      // If next release is in the future, it is scheduled
      if (nextReleaseAtStr && Date.parse(nextReleaseAtStr) > nowMs) {
        scheduleState = "SCHEDULED";
      }

      // Persist fresh upcoming schedule to database if valid
      if (nextEpisode && nextReleaseAtStr) {
        const newTime = new Date(nextReleaseAtStr).getTime();
        const oldTime = entry.next_episode_release_at ? new Date(entry.next_episode_release_at).getTime() : 0;
        if (nextEpisode !== entry.next_episode || Math.abs(newTime - oldTime) > 1000) {
          updatesToPersist.push(
            MediaItem.updateOne(
              { _id: entry._id },
              {
                $set: {
                  next_episode: nextEpisode,
                  next_episode_release_at: new Date(nextReleaseAtStr),
                },
              },
            ),
          );
        }
      }

      items.push({
        _id: String(entry._id),
        title: String(entry.title),
        media_type: String(entry.media_type),
        status: String(entry.status),
        progress_current: userProgress,
        progress_total: Number(entry.progress_total || 0),
        numbering_mode: entryMode,
        season_number: (entry as { season_number?: number | null }).season_number || null,
        episode_offset: entryOffset,
        tracker_url: entry.tracker_url || null,
        custom_cover_url: entry.custom_cover_url || null,
        anilist_id: anilistId > 0 ? anilistId : null,
        schedule_state: scheduleState,
        next_episode: nextEpisode,
        next_episode_release_at: nextReleaseAtStr,
        episode_title: null,
        poster_url: posterUrl,
      });
    }

    if (updatesToPersist.length > 0) {
      await Promise.allSettled(updatesToPersist);
    }

    // Sort: strictly by release time ascending, then non-scheduled alphabetically
    items.sort((a, b) => {
      const timeA = a.next_episode_release_at ? Date.parse(a.next_episode_release_at) : NaN;
      const timeB = b.next_episode_release_at ? Date.parse(b.next_episode_release_at) : NaN;
      const hasTimeA = !isNaN(timeA);
      const hasTimeB = !isNaN(timeB);

      if (hasTimeA && hasTimeB) {
        return timeA - timeB;
      }
      if (hasTimeA) return -1;
      if (hasTimeB) return 1;
      return a.title.localeCompare(b.title);
    });

    const needsMatching = entries
      .filter((entry) => !Number(entry.anilist_id))
      .map((entry) => ({
        _id: String(entry._id),
        title: String(entry.title),
        media_type: String(entry.media_type),
      }));

    const savedMatches = entries
      .filter((entry) => Number(entry.anilist_id) > 0)
      .map((entry) => ({
        _id: String(entry._id),
        title: String(entry.title),
        media_type: String(entry.media_type),
      }));

    return jsonOk({
      items,
      tracked: entries.length,
      unmatched: needsMatching.length,
      needs_matching: needsMatching,
      saved_matches: savedMatches,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err) {
    logInternalError("release_radar_error", err, { route: "release-radar" });
    return jsonError("RELEASE_RADAR_UNAVAILABLE", "Release calendar is temporarily unavailable", 503);
  }
}
