import type { VercelRequest, VercelResponse } from "./_utils/vercelTypes.js";
import { handleOptions, setCors, jsonError } from "./_utils/http.js";

function getQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const mangadexId = getQueryValue(req.query.mangadex_id);
  if (!mangadexId) {
    return jsonError(res, "MISSING_MANGADEX_ID", "Missing mangadex_id", 400);
  }

  try {
    const metaRes = await fetch(
      `https://api.mangadex.org/manga/${encodeURIComponent(mangadexId)}?includes[]=cover_art`,
    );
    if (!metaRes.ok) {
      return jsonError(res, "MANGADEX_LOOKUP_FAILED", "Cover lookup failed", 502);
    }

    const meta = await metaRes.json();
    const coverArt = meta?.data?.relationships?.find(
      (rel: { type?: string; attributes?: { fileName?: string } }) =>
        rel?.type === "cover_art",
    );
    const fileName = coverArt?.attributes?.fileName;

    if (!fileName) {
      return jsonError(res, "COVER_NOT_FOUND", "No cover found", 404);
    }

    const baseUrl = `https://uploads.mangadex.org/covers/${encodeURIComponent(mangadexId)}/${encodeURIComponent(fileName)}`;
    const candidates = [`${baseUrl}.512.jpg`, baseUrl];

    let imageRes: Response | null = null;
    for (const candidate of candidates) {
      const response = await fetch(candidate);
      if (response.ok) {
        imageRes = response;
        break;
      }
    }

    if (!imageRes) {
      return jsonError(res, "COVER_FETCH_FAILED", "Unable to fetch cover image", 502);
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    res.setHeader(
      "Content-Type",
      imageRes.headers.get("content-type") || "image/jpeg",
    );
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).send(buffer);
  } catch {
    return jsonError(res, "COVER_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
