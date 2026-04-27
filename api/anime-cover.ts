import type { VercelRequest, VercelResponse } from "./_utils/vercelTypes.js";
import { handleOptions, setCors, jsonError, jsonOk } from "./_utils/http.js";

function getQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "").trim();
}

async function lookupAniListCover(title: string): Promise<string | null> {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        coverImage {
          extraLarge
          large
          medium
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { search: title },
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const cover = json?.data?.Media?.coverImage;
  return cover?.extraLarge || cover?.large || cover?.medium || null;
}

async function lookupJikanCover(title: string): Promise<string | null> {
  const res = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
    {
      headers: { Accept: "application/json" },
    },
  );

  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.[0]?.images?.jpg?.large_image_url || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const title = getQueryValue(req.query.title);
  if (!title) {
    return jsonError(res, "MISSING_TITLE", "Missing title", 400);
  }

  try {
    const imageUrl =
      (await lookupAniListCover(title)) || (await lookupJikanCover(title));

    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    );
    return jsonOk(res, { imageUrl });
  } catch {
    return jsonError(res, "ANIME_COVER_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
