import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  collectChapterNumbers,
  extractChapterNumberFromHref,
  extractChapterNumberFromText,
  extractEpisodeNumberFromText,
} from "@/lib/scraper";

describe("scraper number extraction", () => {
  it("extracts chapter numbers from slug suffixes", () => {
    expect(
      extractChapterNumberFromHref(
        "/manga/example/chapter-111-eng-li/",
        "https://example.com/manga/example/",
      ),
    ).toBe(111);
  });

  it("extracts the largest episode number from bracket text", () => {
    expect(extractEpisodeNumberFromText("21 [123] Episode")).toBe(123);
  });

  it("extracts standard episode text", () => {
    expect(extractEpisodeNumberFromText("Episode 21")).toBe(21);
  });

  it("collects all selector matches before taking the max", () => {
    const $ = cheerio.load(`
      <div class="last-chapter"><a href="/manga/title/chapter-10/">Chapter 10</a></div>
      <div class="wp-manga-chapter"><a href="/manga/title/chapter-111-eng-li/">Chapter 111</a></div>
      <a href="https://other.example/manga/title/chapter-999/">Chapter 999</a>
    `);

    const numbers = collectChapterNumbers($, "https://example.com/manga/title/", [
      ".last-chapter a",
      ".wp-manga-chapter a",
      'a[href*="chapter-"]',
    ]);

    expect(Math.max(...numbers)).toBe(111);
  });

  it("extracts chapter numbers from text with bracket candidates", () => {
    expect(extractChapterNumberFromText("Chapter 21 [123]")).toBe(123);
  });

  it("does not merge chapter number and relative age text", () => {
    expect(extractChapterNumberFromText("Chapter 1682 days ago")).toBe(168);
    expect(extractChapterNumberFromText("Chapter 1662 weeks ago")).toBe(166);
  });

  it("trusts href number over glued link text", () => {
    const $ = cheerio.load(`
      <a href="/comics/infinite-mage/chapter/168">Chapter 1682 days ago</a>
    `);

    const numbers = collectChapterNumbers($, "https://asurascans.com/comics/infinite-mage/", [
      'a[href*="/chapter/"]',
    ]);

    expect(numbers).toEqual([168]);
  });
});
