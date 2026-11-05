import { describe, expect, it } from "vitest";
import { parseChaptersFromText } from "./chapterParser";
describe("whole-book import", () => {
  it("preserves short chapters rather than silently discarding them", () => {
    const chapters = parseChaptersFromText("Chapter 1: Opening\n\nA brief beginning.\n\nChapter 2: End\n\nThe end.");
    expect(chapters.map(c => c.number)).toEqual([1,2]);
    expect(chapters[0].content).toContain("brief beginning");
    expect(chapters[1].content).toContain("The end.");
  });
});
