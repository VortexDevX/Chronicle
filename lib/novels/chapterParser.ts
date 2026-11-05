import { extractChapterTitle } from "./chapterTitleExtractor";

interface ParsedChapter {
  number: number;
  title: string;
  content: string;
}

/**
 * Parse a large text file and split into chapters
 */
export function parseChaptersFromText(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  const patterns = [
    {
      regex: /^Chapter\s+(\d{1,4})(?:\s*[:\-–—]\s*(.*))?$/im,
      format: "standard",
    },
    { regex: /^Ch\.?\s+(\d{1,4})(?:\s*[:\-–—]\s*(.*))?$/im, format: "short" },
    { regex: /^(\d{1,4})\.\s+(.+)$/im, format: "numbered" },
    {
      regex: /^-+\s*Chapter\s+(\d{1,4})\s*:?\s*(.*?)\s*-+$/im,
      format: "decorated",
    },
    {
      regex: /^=+\s*Chapter\s+(\d{1,4})\s*:?\s*(.*?)\s*=+$/im,
      format: "decorated2",
    },
  ];

  let matches: RegExpMatchArray[] = [];

  for (const { regex } of patterns) {
    const globalRegex = new RegExp(regex.source, "gim");
    const testMatches = Array.from(text.matchAll(globalRegex));

    if (testMatches.length > matches.length) {
      matches = testMatches;
    }
  }

  if (matches.length === 0) {
    return [];
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index || 0;
    const end =
      i + 1 < matches.length
        ? matches[i + 1].index || text.length
        : text.length;

    const chapterText = text.substring(start, end).trim();

    const chapterNum = parseInt(match[1], 10);

    // Extract title from the chapter content
    const extractedTitle = extractChapterTitle(chapterText, chapterNum);

    chapters.push({
      number: chapterNum,
      title: extractedTitle,
      content: chapterText,
    });
  }

  return chapters;
}

/**
 * Validate chapter structure
 */
export function validateChapters(chapters: ParsedChapter[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (chapters.length === 0) {
    errors.push("No chapters found");
    return { valid: false, errors };
  }

  const numbers = chapters.map((ch) => ch.number);
  const duplicates = numbers.filter((num, idx) => numbers.indexOf(num) !== idx);
  if (duplicates.length > 0) {
    errors.push(
      `Duplicate chapter numbers: ${[...new Set(duplicates)].join(", ")}`
    );
  }

  const emptyChapters = chapters.filter((ch) => !ch.content.trim());
  if (emptyChapters.length > 0) {
    errors.push(
      `Chapters with no content: ${emptyChapters
        .map((ch) => ch.number)
        .join(", ")}`
    );
  }

  const sortedNumbers = [...numbers].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i < sortedNumbers.length - 1; i++) {
    if (sortedNumbers[i + 1] - sortedNumbers[i] > 1) {
      gaps.push(sortedNumbers[i]);
    }
  }
  if (gaps.length > 0) {
    errors.push(`Potential missing chapters after: ${gaps.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sort chapters by number
 */
export function sortChapters<T extends { number: number }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => a.number - b.number);
}
