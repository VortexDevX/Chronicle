export interface TitleMapping {
  chapterNumber: number;
  title: string;
  originalLine: string;
}

/** Parse Nocturne's titles.txt format into chapter-number/title pairs. */
export function parseTitlesFile(content: string): Map<number, string> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const titlesMap = new Map<number, string>();
  for (const line of lines) {
    const chapterNumber = extractChapterNumber(line);
    if (chapterNumber !== null) titlesMap.set(chapterNumber, stripChapterPrefix(line));
  }
  return titlesMap;
}

export function extractChapterNumber(line: string): number | null {
  const match = line.match(/^(?:chapter|ch\.?)\s*(\d+)/i);
  if (!match?.[1]) return null;
  const number = Number.parseInt(match[1], 10);
  return Number.isNaN(number) ? null : number;
}

export function stripChapterPrefix(line: string): string {
  const cleaned = line
    .replace(/^(?:chapter|ch\.?)\s*\d+\s*[:\-–—]?\s*/i, "")
    .trim();
  return cleaned || line;
}

export function matchChaptersWithTitles(
  chapterCount: number,
  titlesMap: Map<number, string>,
): Array<{ number: number; title: string; matched: boolean }> {
  return Array.from({ length: chapterCount }, (_, index) => {
    const number = index + 1;
    const title = titlesMap.get(number);
    return { number, title: title || `Chapter ${number}`, matched: Boolean(title) };
  });
}

export function validateTitlesFile(
  titlesMap: Map<number, string>,
  expectedCount: number,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (titlesMap.size === 0) warnings.push("No valid chapter titles found in titles.txt");
  if (titlesMap.size < expectedCount) {
    const missing = expectedCount - titlesMap.size;
    warnings.push(`Only ${titlesMap.size} titles found for ${expectedCount} chapters. ${missing} chapters will use default naming.`);
  }
  if (titlesMap.size > expectedCount) {
    const extra = titlesMap.size - expectedCount;
    warnings.push(`titles.txt contains ${extra} extra titles that won't be used.`);
  }
  return { valid: titlesMap.size > 0, warnings };
}

export function parseTitlesForPreview(content: string): TitleMapping[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const chapterNumber = extractChapterNumber(line);
      if (chapterNumber === null) return null;
      return { chapterNumber, title: stripChapterPrefix(line), originalLine: line };
    })
    .filter((item): item is TitleMapping => item !== null)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}
