import { describe, it, expect, vi } from "vitest";
import { planSimklToAniListMigration, MigrationCandidate } from "./simklMigration";
import { AniListSearchResult } from "@/lib/sources/anilistAiring";

describe("simklMigration", () => {
  it("keeps already verified anilist_id without searching", async () => {
    const mockSearch = vi.fn();
    const candidates: MigrationCandidate[] = [
      { _id: "1", title: "Solo Leveling", media_type: "Anime", anilist_id: 151807, simkl_id: 123 },
    ];

    const plan = await planSimklToAniListMigration(candidates, mockSearch);
    expect(plan.alreadyVerifiedCount).toBe(1);
    expect(plan.matchedCount).toBe(0);
    expect(plan.results[0].status).toBe("already_verified");
    expect(plan.results[0].anilistId).toBe(151807);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("matches deterministically on 1:1 exact title match", async () => {
    const mockResults: AniListSearchResult[] = [
      {
        anilistId: 101,
        title: "Frieren: Beyond Journey's End",
        subtitle: "Sousou no Frieren",
        format: "TV",
        countryOfOrigin: "JP",
        totalEpisodes: 28,
        posterUrl: null,
        status: "FINISHED",
      },
    ];
    const mockSearch = vi.fn().mockResolvedValue(mockResults);

    const candidates: MigrationCandidate[] = [
      { _id: "2", title: "Frieren: Beyond Journey's End", media_type: "Anime", simkl_id: 999 },
    ];

    const plan = await planSimklToAniListMigration(candidates, mockSearch);
    expect(plan.matchedCount).toBe(1);
    expect(plan.results[0].status).toBe("exact_match");
    expect(plan.results[0].anilistId).toBe(101);
  });

  it("flags ambiguous partial matches for manual review without guessing", async () => {
    const mockResults: AniListSearchResult[] = [
      {
        anilistId: 201,
        title: "Attack on Titan Season 2",
        subtitle: "Shingeki no Kyojin Season 2",
        format: "TV",
        countryOfOrigin: "JP",
        totalEpisodes: 12,
        posterUrl: null,
        status: "FINISHED",
      },
    ];
    const mockSearch = vi.fn().mockResolvedValue(mockResults);

    // User has "Attack on Titan", but search returned "Season 2"
    const candidates: MigrationCandidate[] = [
      { _id: "3", title: "Attack on Titan", media_type: "Anime", simkl_id: 555 },
    ];

    const plan = await planSimklToAniListMigration(candidates, mockSearch);
    expect(plan.matchedCount).toBe(0);
    expect(plan.ambiguousCount).toBe(1);
    expect(plan.results[0].status).toBe("manual_review_needed");
    expect(plan.results[0].anilistId).toBeNull();
  });

  it("handles empty search results with not_found status", async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    const candidates: MigrationCandidate[] = [
      { _id: "4", title: "Unknown Obscure Donghua", media_type: "Donghua", simkl_id: 777 },
    ];

    const plan = await planSimklToAniListMigration(candidates, mockSearch);
    expect(plan.results[0].status).toBe("not_found");
    expect(plan.ambiguousCount).toBe(1);
  });
});
