/**
 * Adaptive Chapter Title Extractor
 * Handles 1–3 title lines robustly, avoids prose and inline chapter mentions.
 */

export function extractChapterTitle(
  content: string,
  chapterNumber: number
): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return `Chapter ${chapterNumber}`;

  const titleLines: string[] = [];
  let foundIndex = -1;

  // Find the line that clearly begins a chapter
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    if (/^(?:chapter|ch\.?)\s*\d+/i.test(line)) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex === -1) return `Chapter ${chapterNumber}`;

  // Collect title lines (1–3 lines max)
  for (let i = foundIndex; i < Math.min(lines.length, foundIndex + 4); i++) {
    const line = lines[i];
    if (isProbablyProse(line)) break;
    titleLines.push(line);
  }

  // Combine and clean title lines
  let title = titleLines.join(" ").trim();

  // Remove redundant numbering and markers
  title = title.replace(/^(?:chapter|ch\.?)\s*\d+\s*[:\-–—]?\s*/i, "").trim();

  // Fallback if title is empty
  if (!title) title = `Chapter ${chapterNumber}`;

  return cleanTitle(title);
}

function isProbablyProse(line: string): boolean {
  // Ignore short, title-like lines
  if (line.length < 15) return false;

  // Likely prose if line has verbs + articles + punctuation
  if (
    /\b(the|a|an|was|were|had|has|said|looked|turned|walked|went|came)\b/i.test(
      line
    )
  )
    return true;

  // Long lines (narrative) or sentences
  if (line.length > 120 || /[.!?]"?$/.test(line)) return true;

  return false;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/^[-:–—\s]+|[-:–—\s]+$/g, "")
    .trim();
}

export function extractTitleFromFilename(filename: string): string {
  let title = filename
    .replace(/\.(txt|md)$/i, "")
    .replace(/^\d+\s*[-_\s]+/, "")
    .trim();

  if (title.length > 250) title = title.slice(0, 247) + "...";
  return cleanTitle(title) || "Untitled";
}

export function getChapterTitle(
  content: string,
  filename: string,
  chapterNumber: number
): string {
  const titleFromContent = extractChapterTitle(content, chapterNumber);
  if (titleFromContent === `Chapter ${chapterNumber}`) {
    const titleFromFile = extractTitleFromFilename(filename);
    if (titleFromFile !== "Untitled") return titleFromFile;
  }
  return titleFromContent;
}
