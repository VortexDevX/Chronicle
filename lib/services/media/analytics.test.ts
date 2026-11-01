import { describe, expect, it } from "vitest";
import { normalizeAnalyticsResult } from "@/lib/services/media/analytics";

describe("analytics normalization", () => {
  it("fills known buckets and maps legacy active status", () => {
    const result = normalizeAnalyticsResult({
      totals: [
        {
          total: 4,
          ratedCount: 2,
          avgRating: 8.25,
          totalProgress: 42,
          completed: 1,
        },
      ],
      byStatus: [
        { _id: "Watching/Reading", count: 1 },
        { _id: "Active", count: 1 },
        { _id: "Completed", count: 1 },
      ],
      byType: [{ _id: "Anime", count: 2 }],
      progressByType: [{ _id: "Anime", progress: 12 }, { _id: "Manhwa", progress: 30.5 }],
      recentItems: [],
      topRated: [],
    });

    expect(result.byStatus).toMatchObject({
      Active: 2,
      Completed: 1,
      Planned: 0,
    });
    expect(result.byType).toMatchObject({
      Anime: 2,
      Manhwa: 0,
    });
    expect(result.completionRate).toBe(25);
    expect(result.progressByType).toEqual({ Anime: 12, Manhwa: 30.5 });
  });
});
