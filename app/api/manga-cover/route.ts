import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";

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

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const title = req.nextUrl.searchParams.get("title");
    if (!id && !title) return jsonError("MISSING_QUERY", "Missing id or title", 400);

    const ip = getClientIp(req);
    const guard = await enforceRateLimit(req, {
      key: `manga_cover:${ip}`,
      limit: 100,
      windowMs: 60 * 1000,
      strict: true,
      route: "manga_cover",
      method: "GET",
      message: "Too many requests",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const url = id
      ? `https://api.mangadex.org/manga/${encodeURIComponent(id)}?includes[]=cover_art`
      : `https://api.mangadex.org/manga?title=${encodeURIComponent(title!)}&includes[]=cover_art&limit=1`;

    const res = await fetch(url, {
      cache: "no-store",
    });
    if (!res.ok) return jsonOk({ imageUrl: null });

    const json = await res.json();
    if (!json.data || (Array.isArray(json.data) && json.data.length === 0)) {
      return jsonOk({ imageUrl: null });
    }

    const manga = (Array.isArray(json.data) ? json.data[0] : json.data) as MangaDexManga;
    const imageUrl = getCoverUrl(manga);
    if (imageUrl) return jsonOk({ imageUrl });

    return jsonOk({ imageUrl: null });
  } catch (err) {
    logInternalError("manga_cover_error", err, { route: "manga-cover" });
    return jsonError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
