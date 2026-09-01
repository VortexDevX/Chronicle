import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { MediaItem } from "@/lib/models";
import { fetchSimklAnimeCalendar, matchSimklEntries } from "@/lib/sources/simklCalendar";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const entries = await MediaItem.find({
      user_id: userId,
      status: "Active",
      media_type: { $in: ["Anime", "Donghua"] },
    })
      .select("title media_type status progress_current progress_total tracker_url custom_cover_url anilist_id simkl_id")
      .sort({ last_updated: -1 })
      .limit(300)
      .lean();

    const { payload, lastModified } = await fetchSimklAnimeCalendar();
    const now = new Date();
    const { items, resolvedIds } = matchSimklEntries(entries, payload, now);
    const needsMatching = entries
      .filter((entry, index) => !resolvedIds[index] && !Number(entry.anilist_id))
      .map((entry) => ({ _id: String(entry._id), title: String(entry.title), media_type: String(entry.media_type) }));
    const savedMatches = entries
      .filter((entry, index) => Boolean(resolvedIds[index]) || Number(entry.anilist_id) > 0 || Number(entry.simkl_id) > 0)
      .map((entry) => ({ _id: String(entry._id), title: String(entry.title), media_type: String(entry.media_type) }));

    return jsonOk({
      items,
      tracked: entries.length,
      unmatched: Math.max(0, entries.length - items.length),
      needs_matching: needsMatching,
      saved_matches: savedMatches,
      refreshed_at: lastModified,
    });
  } catch (err) {
    logInternalError("release_radar_error", err, { route: "release-radar" });
    return jsonError("RELEASE_RADAR_UNAVAILABLE", "Release calendar is temporarily unavailable", 503);
  }
}
