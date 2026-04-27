import { describe, expect, it } from "vitest";
import {
  normalizeMALStatus,
  normalizeStatus,
  normalizeType,
  toImportRow,
} from "../../src/utils/validation.js";

describe("import validation helpers", () => {
  it("normalizes common media types and statuses", () => {
    expect(normalizeType("ln")).toBe("Light Novel");
    expect(normalizeType(" manhwa ")).toBe("Manhwa");
    expect(normalizeStatus("in progress")).toBe("Watching/Reading");
    expect(normalizeMALStatus("1", "anime")).toBe("Watching/Reading");
    expect(normalizeMALStatus("6", "manga")).toBe("Planned");
  });

  it("maps MAL export rows into Chronicle import rows", () => {
    expect(
      toImportRow({
        series_title: "Frieren",
        my_status: "2",
        my_watched_episodes: "28",
        series_episodes: "28",
        my_score: "10",
      }),
    ).toEqual({
      title: "Frieren",
      media_type: "Anime",
      status: "Completed",
      progress_current: 28,
      progress_total: 28,
      rating: 10,
      notes: undefined,
    });
  });

  it("clamps imported numeric fields to safe ranges", () => {
    expect(
      toImportRow({
        title: "Solo Leveling",
        type: "manhwa",
        status: "reading",
        progress: "-5",
        total: "200.8",
        score: "99",
      }),
    ).toEqual({
      title: "Solo Leveling",
      media_type: "Manhwa",
      status: "Watching/Reading",
      progress_current: 0,
      progress_total: 200,
      rating: 10,
      notes: undefined,
    });
  });
});
