import { describe, it, expect } from "vitest";
import {
  calculateOffsetFromAniListRelations,
  toContinuousEpisode,
  toSeasonalEpisode,
  detectNumberingMismatch,
  compareProgress,
  formatEpisodeDisplay,
} from "./progressBridge";

describe("progressBridge", () => {
  describe("calculateOffsetFromAniListRelations", () => {
    it("returns offset 0 for empty or missing relations", () => {
      expect(calculateOffsetFromAniListRelations(undefined)).toEqual({
        offset: 0,
        isReliable: true,
        message: expect.stringContaining("No prequels found"),
      });
      expect(calculateOffsetFromAniListRelations({ edges: [] })).toEqual({
        offset: 0,
        isReliable: true,
        message: expect.stringContaining("No prequels found"),
      });
    });

    it("returns offset 0 when edges contain only sequels or side stories", () => {
      const res = calculateOffsetFromAniListRelations({
        edges: [
          {
            relationType: "SEQUEL",
            node: { id: 101, episodes: 12, title: { english: "Season 2", romaji: null } },
          },
          {
            relationType: "SIDE_STORY",
            node: { id: 102, episodes: 1, title: { english: "OVA", romaji: null } },
          },
        ],
      });
      expect(res.offset).toBe(0);
      expect(res.isReliable).toBe(true);
    });

    it("calculates exact offset when all prequels have known episode counts", () => {
      const res = calculateOffsetFromAniListRelations({
        edges: [
          {
            relationType: "PREQUEL",
            node: { id: 201, episodes: 24, title: { english: "Season 1", romaji: null } },
          },
          {
            relationType: "PREQUEL",
            node: { id: 202, episodes: 12, title: { english: "Season 2", romaji: null } },
          },
        ],
      });
      expect(res.offset).toBe(36);
      expect(res.isReliable).toBe(true);
      expect(res.message).toContain("36 verified across 2 prequel(s)");
    });

    it("returns null offset and isReliable=false if any prequel has unknown episode count", () => {
      const res = calculateOffsetFromAniListRelations({
        edges: [
          {
            relationType: "PREQUEL",
            node: { id: 201, episodes: 24, title: { english: "Season 1", romaji: null } },
          },
          {
            relationType: "PREQUEL",
            node: { id: 202, episodes: null, title: { english: "Season 2 Unknown", romaji: null } },
          },
        ],
      });
      expect(res.offset).toBeNull();
      expect(res.isReliable).toBe(false);
      expect(res.message).toContain("unknown episode count");
    });
  });

  describe("episode conversion", () => {
    it("converts seasonal to continuous correctly", () => {
      expect(toContinuousEpisode(4, 24)).toBe(28);
      expect(toContinuousEpisode(1, 0)).toBe(1);
    });

    it("converts continuous to seasonal correctly", () => {
      expect(toSeasonalEpisode(28, 24)).toBe(4);
      expect(toSeasonalEpisode(15, 20)).toBe(0); // clamped to 0
    });
  });

  describe("detectNumberingMismatch", () => {
    it("flags mismatch when current is small and remote is very high", () => {
      expect(detectNumberingMismatch(5, 60, "unspecified")).toBe(true);
      expect(detectNumberingMismatch(12, 55, "continuous")).toBe(true);
    });

    it("flags mismatch when current is high and remote is very small", () => {
      expect(detectNumberingMismatch(75, 12, "unspecified")).toBe(true);
    });

    it("does not flag ordinary increments", () => {
      expect(detectNumberingMismatch(12, 13, "unspecified")).toBe(false);
      expect(detectNumberingMismatch(12, 24, "unspecified")).toBe(false);
      expect(detectNumberingMismatch(55, 60, "continuous")).toBe(false);
    });

    it("does not flag seasonal mode because offset handles it", () => {
      expect(detectNumberingMismatch(5, 60, "seasonal")).toBe(false);
    });
  });

  describe("compareProgress", () => {
    it("handles seasonal mode with continuous remote stream", () => {
      const result = compareProgress({
        current: 3,
        latestRemote: 28,
        numberingMode: "seasonal",
        episodeOffset: 24,
        remoteIsContinuous: true,
      });

      expect(result.remoteInUserUnits).toBe(4); // 28 - 24 = 4
      expect(result.hasNewContent).toBe(true);
      expect(result.delta).toBe(1);
      expect(result.suggestedAction).toBe("notify");
    });

    it("handles seasonal mode when user is already up to date", () => {
      const result = compareProgress({
        current: 4,
        latestRemote: 28,
        numberingMode: "seasonal",
        episodeOffset: 24,
        remoteIsContinuous: true,
      });

      expect(result.remoteInUserUnits).toBe(4);
      expect(result.hasNewContent).toBe(false);
      expect(result.delta).toBe(0);
      expect(result.suggestedAction).toBe("none");
    });

    it("handles continuous mode when remote is seasonal", () => {
      const result = compareProgress({
        current: 28,
        latestRemote: 5,
        numberingMode: "continuous",
        episodeOffset: 24,
        remoteIsContinuous: false,
      });

      expect(result.remoteInUserUnits).toBe(29); // 5 + 24 = 29
      expect(result.hasNewContent).toBe(true);
      expect(result.delta).toBe(1);
      expect(result.suggestedAction).toBe("notify");
    });

    it("flags needs_review when there is a suspected numbering mismatch in unspecified mode", () => {
      const result = compareProgress({
        current: 3,
        latestRemote: 75,
        numberingMode: "unspecified",
      });

      expect(result.suspectedMismatch).toBe(true);
      expect(result.suggestedAction).toBe("needs_review");
    });
  });

  describe("formatEpisodeDisplay", () => {
    it("formats seasonal show", () => {
      expect(formatEpisodeDisplay({ progress: 4, numberingMode: "seasonal", seasonNumber: 2 })).toBe("S2 Ep 4");
    });

    it("formats continuous show with season offset context", () => {
      expect(
        formatEpisodeDisplay({
          progress: 28,
          numberingMode: "continuous",
          seasonNumber: 2,
          episodeOffset: 24,
        }),
      ).toBe("Ep 28 (S2 Ep 4)");
    });

    it("formats unspecified or standard show", () => {
      expect(formatEpisodeDisplay({ progress: 15 })).toBe("Ep 15");
    });
  });
});
