import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";
import { fetchWithTimeout } from "@/lib/externalFetch";

type AniListCoverResponse = {
  data?: {
    Media?: {
      coverImage?: {
        extraLarge?: string | null;
        large?: string | null;
        medium?: string | null;
      } | null;
    } | null;
  };
};

type JikanCoverResponse = {
  data?: {
    images?: {
      jpg?: {
        large_image_url?: string | null;
        image_url?: string | null;
      };
    };
  }[];
};

async function fetchAniListCover(title: string): Promise<string | null> {
  const res = await fetchWithTimeout("https://graphql.anilist.co", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: `
        query ($search: String!) {
          Media(search: $search, type: ANIME) {
            coverImage {
              extraLarge
              large
              medium
            }
          }
        }
      `,
      variables: { search: title },
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as AniListCoverResponse;
  const cover = json.data?.Media?.coverImage;
  return cover?.extraLarge || cover?.large || cover?.medium || null;
}

async function fetchJikanCover(title: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Chronicle/1.0",
    },
  });

  if (!res.ok) return null;
  const json = (await res.json()) as JikanCoverResponse;
  const jpg = json.data?.[0]?.images?.jpg;
  return jpg?.large_image_url || jpg?.image_url || null;
}

export async function GET(req: NextRequest) {
  try {
    const title = req.nextUrl.searchParams.get("title");
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) return jsonError("MISSING_TITLE", "Missing title", 400);
    if (normalizedTitle.length > 200) {
      return jsonError("TITLE_TOO_LONG", "Title is too long", 400);
    }

    const ip = getClientIp(req);
    const guard = await enforceRateLimit(req, {
      key: `anime_cover:${ip}`,
      limit: 100,
      windowMs: 60 * 1000,
      strict: true,
      route: "anime_cover",
      method: "GET",
      message: "Too many requests",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    let imageUrl: string | null = null;
    try {
      imageUrl = await fetchAniListCover(normalizedTitle);
    } catch {
      // Jikan remains a separate fallback when AniList is unavailable.
    }
    if (!imageUrl) {
      try {
        imageUrl = await fetchJikanCover(normalizedTitle);
      } catch {
        imageUrl = null;
      }
    }

    return jsonOk({ imageUrl });
  } catch (err) {
    logInternalError("anime_cover_error", err, { route: "anime-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
