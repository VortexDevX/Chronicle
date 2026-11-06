import { describe, expect, it } from "vitest";
import {
  extractChapterNumber,
  matchChaptersWithTitles,
  parseTitlesFile,
  parseTitlesForPreview,
  stripChapterPrefix,
  validateTitlesFile,
} from "./titleProcessor";

describe("Nocturne titles.txt processing", () => {
  it("accepts every title prefix supported by Nocturne", () => {
    const titles = parseTitlesFile([
      "Chapter 1: First Light",
      "Chapter 2 - The Long Road",
      "Ch 3 The Crossing",
      "Ch. 4 — Home",
      "not a chapter title",
    ].join("\r\n"));
    expect(Object.fromEntries(titles)).toEqual({
      1: "First Light",
      2: "The Long Road",
      3: "The Crossing",
      4: "Home",
    });
  });

  it("uses the last duplicate and preserves a number-only title line", () => {
    const titles = parseTitlesFile("Chapter 1: Old\nChapter 1: New\nChapter 2");
    expect(titles.get(1)).toBe("New");
    expect(titles.get(2)).toBe("Chapter 2");
  });

  it("matches by one-based chapter position and falls back exactly like Nocturne", () => {
    expect(matchChaptersWithTitles(3, new Map([[2, "Middle"]]))).toEqual([
      { number: 1, title: "Chapter 1", matched: false },
      { number: 2, title: "Middle", matched: true },
      { number: 3, title: "Chapter 3", matched: false },
    ]);
  });

  it("reports missing and extra title counts", () => {
    expect(validateTitlesFile(new Map([[1, "One"]]), 3)).toEqual({
      valid: true,
      warnings: ["Only 1 titles found for 3 chapters. 2 chapters will use default naming."],
    });
    expect(validateTitlesFile(new Map(), 1).valid).toBe(false);
    expect(validateTitlesFile(new Map([[1, "One"], [2, "Two"]]), 1).warnings[0]).toContain("1 extra");
  });

  it("keeps the preview helpers compatible", () => {
    expect(extractChapterNumber("Ch. 42: Answer")).toBe(42);
    expect(extractChapterNumber("Part 42: Answer")).toBeNull();
    expect(stripChapterPrefix("Chapter 42: Answer")).toBe("Answer");
    expect(parseTitlesForPreview("Chapter 9: Nine\nChapter 2: Two").map((item) => item.chapterNumber)).toEqual([2, 9]);
  });
});
