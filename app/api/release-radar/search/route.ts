import { NextRequest } from "next/server";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { searchAniListMedia } from "@/lib/sources/anilistAiring";

export async function GET(req: NextRequest) {
  const { userId, errorResponse } = await requireAuthUserId(req);
  if (!userId && errorResponse) return errorResponse;

  const query = String(req.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2 || query.length > 200) {
    return jsonError("INVALID_QUERY", "Enter at least two characters", 400);
  }

  try {
    const items = await searchAniListMedia(query);
    return jsonOk({ items });
  } catch {
    return jsonError("TITLE_SEARCH_UNAVAILABLE", "Title search is temporarily unavailable", 503);
  }
}
