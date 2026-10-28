import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/guards";
import { getClientIp } from "@/lib/rateLimit";
import { logInternalError } from "@/lib/log";
import { fetchWithTimeout } from "@/lib/externalFetch";
import { searchAniListMedia } from "@/lib/sources/anilist";

export type UnifiedSearchResult = {
  id: string;
  title: string;
  subtitle: string | null;
  mediaType: "Anime" | "Donghua" | "Manhwa";
  posterUrl: string | null;
  totalEpisodes: number | null;
  status: string | null;
  anilistId: number | null;
  mangadexId: string | null;
  source: "anilist" | "mangadex";
};

type MangaDexRelationship = {
  type?: string;
  attributes?: {
    fileName?: string;
  };
};

type MangaDexItem = {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    publicationDemographic?: string;
    lastChapter?: string;
    status?: string;
  };
  relationships?: MangaDexRelationship[];
};

async function searchMangaDex(query: string, limit = 6): Promise<UnifiedSearchResult[]> {
  try {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&limit=${limit}`;
    const res = await fetchWithTimeout(url, { cache: "no-store" }, 5000);
    if (!res.ok) return [];

    const json = (await res.json()) as { data?: MangaDexItem[] };
    const list = Array.isArray(json.data) ? json.data : [];

    return list.map((item) => {
      const titleObj = item.attributes?.title || {};
      const title = titleObj.en || Object.values(titleObj)[0] || "Untitled";
      const coverRel = item.relationships?.find((r) => r.type === "cover_art");
      const fileName = coverRel?.attributes?.fileName;
      const posterUrl = fileName && item.id
        ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.256.jpg`
        : null;

      const lastChapter = Number(item.attributes?.lastChapter);
      return {
        id: `mangadex:${item.id}`,
        title,
        subtitle: item.attributes?.publicationDemographic || null,
        mediaType: "Manhwa",
        posterUrl,
        totalEpisodes: Number.isFinite(lastChapter) && lastChapter > 0 ? lastChapter : null,
        status: item.attributes?.status || null,
        anilistId: null,
        mangadexId: item.id,
        source: "mangadex",
      };
    });
  } catch (err) {
    logInternalError("mangadex_search_error", err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const type = req.nextUrl.searchParams.get("type")?.trim() || "all";

    if (!q || q.length < 2) {
      return jsonOk({ items: [] });
    }

    if (q.length > 100) {
      return jsonError("QUERY_TOO_LONG", "Search query is too long", 400);
    }

    const ip = getClientIp(req);
    const guard = await enforceRateLimit(req, {
      key: `omnisearch:${ip}`,
      limit: 60,
      windowMs: 60 * 1000,
      strict: true,
      route: "search/unified",
      method: "GET",
      message: "Too many search requests",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const searches: Array<Promise<UnifiedSearchResult[]>> = [];

    // AniList handles Anime and Donghua
    if (type === "all" || type === "Anime" || type === "Donghua") {
      const country = type === "Donghua" ? "CN" : undefined;
      searches.push(
        searchAniListMedia(q, { countryOfOrigin: country, limit: 8 }).then((items) =>
          items.map((item) => ({
            id: `anilist:${item.anilistId}`,
            title: item.title,
            subtitle: item.subtitle,
            mediaType: item.countryOfOrigin === "CN" ? "Donghua" : "Anime",
            posterUrl: item.posterUrl,
            totalEpisodes: item.totalEpisodes,
            status: item.status,
            anilistId: item.anilistId,
            mangadexId: null,
            source: "anilist",
          })),
        ),
      );
    }

    // MangaDex handles Manhwa
    if (type === "all" || type === "Manhwa") {
      searches.push(searchMangaDex(q, 6));
    }

    const results = await Promise.all(searches);
    const combined = results.flat();

    return jsonOk({ items: combined });
  } catch (err) {
    logInternalError("unified_search_failed", err);
    return jsonError("SEARCH_ERROR", "Unified search failed", 500);
  }
}
