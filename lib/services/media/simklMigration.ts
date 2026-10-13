import { searchAniListMedia } from "@/lib/sources/anilistAiring";

export type MigrationCandidate = {
  _id: string;
  title: string;
  media_type: string;
  anilist_id?: number | null;
  simkl_id?: number | null;
};

export type MigrationResult = {
  id: string;
  title: string;
  status: "already_verified" | "exact_match" | "manual_review_needed" | "not_found";
  anilistId: number | null;
  reason: string;
};

export function normalizeTitleForComparison(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Plans migration of Simkl IDs to AniList IDs with deterministic matching.
 * Never guesses ambiguous or multiple disparate results.
 */
export async function planSimklToAniListMigration(
  candidates: MigrationCandidate[],
  searchFn = searchAniListMedia,
): Promise<{
  results: MigrationResult[];
  matchedCount: number;
  ambiguousCount: number;
  alreadyVerifiedCount: number;
}> {
  const results: MigrationResult[] = [];
  let matchedCount = 0;
  let ambiguousCount = 0;
  let alreadyVerifiedCount = 0;

  for (const item of candidates) {
    // Tier 1: Already has AniList ID
    if (Number.isInteger(item.anilist_id) && Number(item.anilist_id) > 0) {
      alreadyVerifiedCount++;
      results.push({
        id: item._id,
        title: item.title,
        status: "already_verified",
        anilistId: Number(item.anilist_id),
        reason: "Already mapped to AniList ID",
      });
      continue;
    }

    // Skip items without Simkl ID
    if (!Number.isInteger(item.simkl_id) || Number(item.simkl_id) <= 0) {
      results.push({
        id: item._id,
        title: item.title,
        status: "manual_review_needed",
        anilistId: null,
        reason: "No Simkl ID or AniList ID present",
      });
      ambiguousCount++;
      continue;
    }

    // Query AniList for candidates
    const country = item.media_type === "Donghua" ? "CN" : undefined;
    const searchResults = await searchFn(item.title, { countryOfOrigin: country, limit: 5 });

    if (searchResults.length === 0) {
      ambiguousCount++;
      results.push({
        id: item._id,
        title: item.title,
        status: "not_found",
        anilistId: null,
        reason: "No matches found on AniList for this title",
      });
      continue;
    }

    const normalizedWanted = normalizeTitleForComparison(item.title);
    const exactMatches = searchResults.filter((sr) => {
      const normEnglish = sr.title ? normalizeTitleForComparison(sr.title) : "";
      const normSub = sr.subtitle ? normalizeTitleForComparison(sr.subtitle) : "";
      return normEnglish === normalizedWanted || normSub === normalizedWanted;
    });

    if (exactMatches.length === 1) {
      matchedCount++;
      results.push({
        id: item._id,
        title: item.title,
        status: "exact_match",
        anilistId: exactMatches[0].anilistId,
        reason: `Exact match: "${exactMatches[0].title}" (ID ${exactMatches[0].anilistId})`,
      });
    } else {
      // Ambiguous: Multiple exact matches or only partial matches. Flag for manual review!
      ambiguousCount++;
      results.push({
        id: item._id,
        title: item.title,
        status: "manual_review_needed",
        anilistId: null,
        reason:
          exactMatches.length > 1
            ? `Multiple potential matches (${exactMatches.length})`
            : `Top candidate "${searchResults[0].title}" did not match exact title`,
      });
    }
  }

  return {
    results,
    matchedCount,
    ambiguousCount,
    alreadyVerifiedCount,
  };
}
