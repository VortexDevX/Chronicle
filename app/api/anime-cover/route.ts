import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";

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
  const res = await fetch("https://graphql.anilist.co", {
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
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`, {
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
    if (!title) return jsonError("MISSING_TITLE", "Missing title", 400);

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

    const imageUrl = await fetchAniListCover(title) || await fetchJikanCover(title);

    return jsonOk({ imageUrl });
  } catch (err) {
    logInternalError("anime_cover_error", err, { route: "anime-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
