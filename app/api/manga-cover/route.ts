import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp, isLocalhostDevelopmentRequest } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";
import { fetchWithTimeout } from "@/lib/externalFetch";

type MangaDexRelationship = {
  type?: string;
  attributes?: {
    fileName?: string;
  };
};

type MangaDexManga = {
  id?: string;
  relationships?: MangaDexRelationship[];
};

function getCoverUrl(manga: MangaDexManga): string | null {
  const coverRel = manga.relationships?.find((r) => r.type === "cover_art");
  const fileName = coverRel?.attributes?.fileName;
  if (!fileName || !manga.id) return null;
  return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`;
}

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
    const id = req.nextUrl.searchParams.get("id");
    const title = req.nextUrl.searchParams.get("title");
    if (!id && !title) return jsonError("MISSING_QUERY", "Missing id or title", 400);
    if (title && title.trim().length > 200) {
      return jsonError("TITLE_TOO_LONG", "Title is too long", 400);
    }

    if (!isLocalhostDevelopmentRequest(req)) {
      const guard = await enforceRateLimit(req, {
        key: `manga_cover:${getClientIp(req)}`,
        limit: 100,
        windowMs: 60 * 1000,
        strict: true,
        route: "manga_cover",
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

    const url = id
      ? `https://api.mangadex.org/manga/${encodeURIComponent(id)}?includes[]=cover_art`
      : `https://api.mangadex.org/manga?title=${encodeURIComponent(title!)}&includes[]=cover_art&limit=1`;

    const res = await fetchWithTimeout(url, {
      cache: "no-store",
    });
    if (res.status === 400 || res.status === 404) return coverResponse(null);
    if (res.status === 429) {
      const response = jsonError("PROVIDER_RATE_LIMITED", "MangaDex rate limit reached", 429);
      response.headers.set("Retry-After", res.headers.get("Retry-After") || "60");
      return response;
    }
    if (!res.ok) return jsonError("PROVIDER_UNAVAILABLE", "MangaDex cover lookup failed", 502);

    const json = await res.json();
    if (!json.data || (Array.isArray(json.data) && json.data.length === 0)) {
      return coverResponse(null);
    }

    const manga = (Array.isArray(json.data) ? json.data[0] : json.data) as MangaDexManga;
    const imageUrl = getCoverUrl(manga);
    if (imageUrl) return coverResponse(imageUrl);

    return coverResponse(null);
  } catch (err) {
    logInternalError("manga_cover_error", err, { route: "manga-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
