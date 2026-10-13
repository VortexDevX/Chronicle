import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { MediaItem } from "@/lib/models";
import { fetchAniListMediaById } from "@/lib/sources/anilistAiring";
import { resolveAiringCalendarSchedule } from "@/lib/sources/airingCalendar";

export async function POST(req: NextRequest) {
  await connectDB();
  const { userId, errorResponse } = await requireAuthUserId(req);
  if (!userId && errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const anilistId = Number(body.anilist_id ?? body.simkl_id);

  if (!mongoose.Types.ObjectId.isValid(id) || !Number.isInteger(anilistId) || anilistId <= 0) {
    return jsonError("INVALID_MATCH", "Choose a valid title", 400);
  }

  // Fetch verified media details from AniList to update total episodes, next release, etc.
  const media = await fetchAniListMediaById(anilistId);

  const updates: Record<string, unknown> = {
    anilist_id: anilistId,
    tracking_source: "anilist",
  };

  if (media) {
    if (media.episodes && Number(media.episodes) > 0) {
      updates.progress_total = media.episodes;
    }
    if (media.nextAiringEpisode?.episode && media.nextAiringEpisode.airingAt > 0) {
      updates.next_episode = media.nextAiringEpisode.episode;
      updates.next_episode_release_at = new Date(media.nextAiringEpisode.airingAt * 1000);
    }
    if (media.coverImage?.large) {
      updates.custom_cover_url = media.coverImage.large;
    }
  }

  // If AniList did not have an upcoming episode date, check fallback calendar (e.g. Donghua)
  if (!updates.next_episode) {
    const existing = (await MediaItem.findById(id)
      .select("simkl_id title next_episode next_episode_release_at")
      .lean()) as {
      simkl_id?: number;
      title?: string;
      next_episode?: number | null;
      next_episode_release_at?: Date | string | null;
    } | null;
    const fallback = await resolveAiringCalendarSchedule({
      anilist_id: anilistId,
      simkl_id: existing?.simkl_id,
      title: existing?.title || media?.title.english || media?.title.romaji,
    });
    if (fallback) {
      updates.next_episode = fallback.nextEpisode;
      updates.next_episode_release_at = fallback.nextReleaseAt;
      if (!updates.custom_cover_url && fallback.posterUrl) {
        updates.custom_cover_url = fallback.posterUrl;
      }
    } else if (existing?.next_episode && existing?.next_episode_release_at) {
      // Preserve existing valid future schedule
      if (new Date(existing.next_episode_release_at).getTime() > Date.now()) {
        updates.next_episode = existing.next_episode;
        updates.next_episode_release_at = existing.next_episode_release_at;
      }
    }
  }

  const item = await MediaItem.findOneAndUpdate(
    { _id: id, user_id: userId, media_type: { $in: ["Anime", "Donghua"] } },
    { $set: updates },
    { new: true },
  );

  if (!item) return jsonError("NOT_FOUND", "Entry not found", 404);
  return jsonOk({ id: String(item._id), anilist_id: anilistId });
}
