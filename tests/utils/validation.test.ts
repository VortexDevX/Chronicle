import { describe, it, expect } from "vitest";
import {
  normalizeType,
  normalizeStatus,
  normalizeMALStatus,
  toImportRow,
  toImportRowFromMAL,
  inferMALType,
  looksLikeMALRow,
} from "../../src/utils/validation";

describe("normalizeType", () => {
  it("normalizes 'anime' to 'Anime'", () => {
    expect(normalizeType("anime")).toBe("Anime");
  });
  it("normalizes 'MANHWA' to 'Manhwa'", () => {
    expect(normalizeType("MANHWA")).toBe("Manhwa");
  });
  it("normalizes 'donghua' to 'Donghua'", () => {
    expect(normalizeType("donghua")).toBe("Donghua");
  });
  it("normalizes 'light novel' to 'Light Novel'", () => {
    expect(normalizeType("light novel")).toBe("Light Novel");
  });
  it("normalizes 'ln' to 'Light Novel'", () => {
    expect(normalizeType("ln")).toBe("Light Novel");
  });
  it("normalizes 'novel' to 'Light Novel'", () => {
    expect(normalizeType("novel")).toBe("Light Novel");
  });
  it("returns trimmed value for unknown type", () => {
    expect(normalizeType("  manga  ")).toBe("manga");
  });
});

describe("normalizeStatus", () => {
  it("normalizes 'watching' to 'Watching/Reading'", () => {
    expect(normalizeStatus("watching")).toBe("Watching/Reading");
  });
  it("normalizes 'reading' to 'Watching/Reading'", () => {
    expect(normalizeStatus("reading")).toBe("Watching/Reading");
  });
  it("normalizes 'in progress' to 'Watching/Reading'", () => {
    expect(normalizeStatus("in progress")).toBe("Watching/Reading");
  });
  it("normalizes 'plan to watch' to 'Planned'", () => {
    expect(normalizeStatus("plan to watch")).toBe("Planned");
  });
  it("normalizes 'plan to read' to 'Planned'", () => {
    expect(normalizeStatus("plan to read")).toBe("Planned");
  });
  it("normalizes 'paused' to 'On Hold'", () => {
    expect(normalizeStatus("paused")).toBe("On Hold");
  });
  it("normalizes 'dropped' to 'Dropped'", () => {
    expect(normalizeStatus("dropped")).toBe("Dropped");
  });
  it("normalizes 'finished' to 'Completed'", () => {
    expect(normalizeStatus("finished")).toBe("Completed");
  });
  it("normalizes 'complete' to 'Completed'", () => {
    expect(normalizeStatus("complete")).toBe("Completed");
  });
});

describe("normalizeMALStatus", () => {
  it("converts code 1 to 'Watching/Reading'", () => {
    expect(normalizeMALStatus("1", "anime")).toBe("Watching/Reading");
  });
  it("converts code 2 to 'Completed'", () => {
    expect(normalizeMALStatus("2", "anime")).toBe("Completed");
  });
  it("converts code 3 to 'On Hold'", () => {
    expect(normalizeMALStatus("3", "manga")).toBe("On Hold");
  });
  it("converts code 4 to 'Dropped'", () => {
    expect(normalizeMALStatus("4", "anime")).toBe("Dropped");
  });
  it("converts code 6 to 'Planned'", () => {
    expect(normalizeMALStatus("6", "anime")).toBe("Planned");
  });
  it("converts 'currently reading' to 'Watching/Reading'", () => {
    expect(normalizeMALStatus("currently reading", "manga")).toBe(
      "Watching/Reading",
    );
  });
  it("defaults unknown to 'Watching/Reading'", () => {
    expect(normalizeMALStatus("something else", "anime")).toBe(
      "Watching/Reading",
    );
  });
});

describe("inferMALType", () => {
  it("returns 'Anime' for anime bucket", () => {
    expect(inferMALType({}, "anime")).toBe("Anime");
  });
  it("returns 'Light Novel' for novel series_type", () => {
    expect(inferMALType({ series_type: "Novel" }, "manga")).toBe("Light Novel");
  });
  it("returns 'Manhwa' for manhwa series_type", () => {
    expect(inferMALType({ series_type: "Manhwa" }, "manga")).toBe("Manhwa");
  });
  it("defaults manga to 'Manhwa'", () => {
    expect(inferMALType({}, "manga")).toBe("Manhwa");
  });
});

describe("looksLikeMALRow", () => {
  it("returns true for MAL anime row", () => {
    expect(looksLikeMALRow({ series_title: "Test", my_watched_episodes: 5 })).toBe(true);
  });
  it("returns true for MAL manga row", () => {
    expect(looksLikeMALRow({ my_read_chapters: 10 })).toBe(true);
  });
  it("returns false for non-MAL row", () => {
    expect(looksLikeMALRow({ title: "Test", progress_current: 5 })).toBe(false);
  });
});

describe("toImportRow", () => {
  it("parses a standard Chronicle row", () => {
    const row = {
      title: "Solo Leveling",
      media_type: "Manhwa",
      status: "Watching/Reading",
      progress_current: 50,
      progress_total: 200,
      rating: 9,
      notes: "Great",
    };
    const result = toImportRow(row);
    expect(result).toEqual({
      title: "Solo Leveling",
      media_type: "Manhwa",
      status: "Watching/Reading",
      progress_current: 50,
      progress_total: 200,
      rating: 9,
      notes: "Great",
    });
  });

  it("handles aliased headers", () => {
    const row = {
      name: "Attack on Titan",
      type: "Anime",
      current: 25,
      total: 75,
    };
    const result = toImportRow(row);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Attack on Titan");
    expect(result!.progress_current).toBe(25);
  });

  it("returns null for empty title", () => {
    const row = { title: "", media_type: "Anime", status: "Planned" };
    expect(toImportRow(row)).toBeNull();
  });

  it("clamps rating to 0-10", () => {
    const row = {
      title: "Test",
      media_type: "Anime",
      status: "Completed",
      rating: 15,
    };
    const result = toImportRow(row);
    expect(result!.rating).toBe(10);
  });

  it("floors progress values", () => {
    const row = {
      title: "Test",
      media_type: "Anime",
      status: "Watching/Reading",
      progress_current: 5.7,
      progress_total: 12.9,
    };
    const result = toImportRow(row);
    expect(result!.progress_current).toBe(5);
    expect(result!.progress_total).toBe(12);
  });
});

describe("toImportRowFromMAL", () => {
  it("parses MAL anime row", () => {
    const row = {
      series_title: "Naruto",
      my_status: "1",
      my_watched_episodes: "50",
      series_episodes: "220",
      my_score: "8",
    };
    const result = toImportRowFromMAL(row);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Naruto");
    expect(result!.media_type).toBe("Anime");
    expect(result!.status).toBe("Watching/Reading");
    expect(result!.progress_current).toBe(50);
    expect(result!.progress_total).toBe(220);
    expect(result!.rating).toBe(8);
  });

  it("parses MAL manga row", () => {
    const row = {
      series_title: "One Piece",
      my_status: "2",
      my_read_chapters: "1000",
      series_chapters: "1050",
    };
    const result = toImportRowFromMAL(row);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("One Piece");
    expect(result!.media_type).toBe("Manhwa");
    expect(result!.status).toBe("Completed");
    expect(result!.progress_current).toBe(1000);
  });

  it("returns null for non-MAL row", () => {
    const row = { title: "Test", progress_current: 5 };
    expect(toImportRowFromMAL(row)).toBeNull();
  });
});
