import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";
import { fetchWithTimeout } from "@/lib/externalFetch";
import { fetchAniListMediaById } from "@/lib/sources/anilistAiring";

type KitsuCoverResponse = {
  data?: Array<{
    attributes?: {
      posterImage?: {
        large?: string | null;
        original?: string | null;
        medium?: string | null;
      };
    };
  }>;
};

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

function isLowResCover(url: string | null): boolean {
  if (!url) return true;
  return url.includes("/medium/") || url.includes("/small/") || url.includes("tiny-");
}

async function fetchAniListCoverById(anilistId: number): Promise<string | null> {
  try {
    const media = await fetchAniListMediaById(anilistId);
    const cover = media?.coverImage;
    return cover?.extraLarge || cover?.large || cover?.medium || null;
  } catch {
    return null;
  }
}

async function fetchAniListCover(title: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    "https://graphql.anilist.co",
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Chronicle/1.0",
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
    },
    3000,
  );

  if (!res.ok) return null;
  const json = (await res.json()) as AniListCoverResponse;
  const cover = json.data?.Media?.coverImage;
  return cover?.extraLarge || cover?.large || cover?.medium || null;
}

async function fetchKitsuCover(title: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.api+json",
        "User-Agent": "Chronicle/1.0",
      },
    },
    3000,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as KitsuCoverResponse;
  const poster = json.data?.[0]?.attributes?.posterImage;
  return poster?.original || poster?.large || poster?.medium || null;
}

async function fetchJikanCover(title: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Chronicle/1.0",
      },
    },
    3000,
  );

  if (!res.ok) return null;
  const json = (await res.json()) as JikanCoverResponse;
  const jpg = json.data?.[0]?.images?.jpg;
  return jpg?.large_image_url || jpg?.image_url || null;
}

export async function GET(req: NextRequest) {
  try {
    const title = req.nextUrl.searchParams.get("title");
    const rawAniListId = req.nextUrl.searchParams.get("anilist_id");
    const anilistId = rawAniListId ? Number(rawAniListId) : null;
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

    // 1. Primary: Direct AniList ID lookup if provided
    if (anilistId && Number.isInteger(anilistId) && anilistId > 0) {
      imageUrl = await fetchAniListCoverById(anilistId);
      // If AniList only has a low-res thumbnail, attempt to find a sharper HD cover
      if (imageUrl && isLowResCover(imageUrl)) {
        try {
          const sharper = (await fetchKitsuCover(normalizedTitle)) || (await fetchJikanCover(normalizedTitle));
          if (sharper && !isLowResCover(sharper)) {
            imageUrl = sharper;
          }
        } catch {
          // Keep AniList candidate as fallback
        }
      }
    }

    // 2. Secondary: AniList GraphQL search by title
    if (!imageUrl) {
      try {
        imageUrl = await fetchAniListCover(normalizedTitle);
        if (imageUrl && isLowResCover(imageUrl)) {
          const sharper = (await fetchKitsuCover(normalizedTitle)) || (await fetchJikanCover(normalizedTitle));
          if (sharper && !isLowResCover(sharper)) {
            imageUrl = sharper;
          }
        }
      } catch {
        // Fall through to Kitsu
      }
    }

    // 3. Tertiary: Kitsu API (public, high availability, sharp original images)
    if (!imageUrl || isLowResCover(imageUrl)) {
      try {
        const kitsuCover = await fetchKitsuCover(normalizedTitle);
        if (kitsuCover && (!imageUrl || !isLowResCover(kitsuCover))) {
          imageUrl = kitsuCover;
        }
      } catch {
        // Fall through to Jikan
      }
    }

    // 4. Quaternary: Jikan / MyAnimeList
    if (!imageUrl || isLowResCover(imageUrl)) {
      try {
        const jikanCover = await fetchJikanCover(normalizedTitle);
        if (jikanCover && (!imageUrl || !isLowResCover(jikanCover))) {
          imageUrl = jikanCover;
        }
      } catch {
        // Keep whatever candidate exists
      }
    }

    return jsonOk({ imageUrl });
  } catch (err) {
    logInternalError("anime_cover_error", err, { route: "anime-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
