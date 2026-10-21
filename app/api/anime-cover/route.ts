import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp, isLocalhostDevelopmentRequest } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";
import { fetchAniListMediaById, searchAniListMedia } from "@/lib/sources/anilistAiring";
import { fetchMyAnimeListCoverByTitle } from "@/lib/sources/myAnimeListCover";

function coverResponse(imageUrl: string | null) {
  const response = jsonOk({ imageUrl });
  response.headers.set(
    "Cache-Control",
    imageUrl
      ? "public, max-age=3600, stale-while-revalidate=86400"
      : "public, max-age=300, stale-while-revalidate=600",
  );
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const title = String(req.nextUrl.searchParams.get("title") || "").trim();
    const rawAniListId = req.nextUrl.searchParams.get("anilist_id");
    const anilistId = rawAniListId ? Number(rawAniListId) : null;
    if (!title) return jsonError("MISSING_TITLE", "Missing title", 400);
    if (title.length > 200) return jsonError("TITLE_TOO_LONG", "Title is too long", 400);
    if (rawAniListId && (!Number.isInteger(anilistId) || Number(anilistId) <= 0)) {
      return jsonError("INVALID_ANILIST_ID", "Invalid AniList ID", 400);
    }

    if (!isLocalhostDevelopmentRequest(req)) {
      const guard = await enforceRateLimit(req, {
        key: `anime_cover:${getClientIp(req)}`,
        limit: 100,
        windowMs: 60 * 1000,
        strict: true,
        route: "anime_cover",
        method: "GET",
        message: "Too many requests",
      });
      if (!guard.allowed && guard.errorResponse) {
        if (!guard.errorResponse.headers.has("Retry-After")) {
          guard.errorResponse.headers.set("Retry-After", "1");
        }
        return guard.errorResponse;
      }
    }

    let imageUrl: string | null = null;
    if (anilistId) {
      const media = await fetchAniListMediaById(anilistId);
      const cover = media?.coverImage;
      imageUrl = cover?.extraLarge || cover?.large || cover?.medium || null;
    }
    if (!imageUrl) {
      const results = await searchAniListMedia(title, { limit: 10 });
      const normalizedTitle = title.trim().toLocaleLowerCase();
      const match = results.find((result) =>
        [result.title, result.subtitle].some(
          (candidate) => candidate?.trim().toLocaleLowerCase() === normalizedTitle,
        ),
      ) || results[0];
      imageUrl = match?.posterUrl || null;
    }
    if (!imageUrl) imageUrl = await fetchMyAnimeListCoverByTitle(title);

    return coverResponse(imageUrl);
  } catch (err) {
    logInternalError("anime_cover_error", err, { route: "anime-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
