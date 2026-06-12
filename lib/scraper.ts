import * as cheerio from "cheerio";

export type ScraperRule = {
  hosts: string[];
  selectors: string[];
};

const SCRAPER_RULES: ScraperRule[] = [
  {
    hosts: ["arenascan.com"],
    selectors: [".eplister li a", ".eph-num a", ".bxcl ul li a"],
  },
  {
    hosts: ["magicemperor.xyz"],
    selectors: [".wp-manga-chapter a", ".listing-chapters_wrap li a"],
  },
  {
    hosts: ["magicemperors.com"],
    selectors: [".last-chapter a", ".scroll-sm a", ".item a"],
  },
  {
    hosts: ["levelingwithgods.com"],
    selectors: ['a[href*="chapter-"]', 'a[href*="/manga/"]'],
  },
  {
    hosts: ["infinitelevelup.com"],
    selectors: ['a[href*="/manga/"][href*="chapter-"]'],
  },
  {
    hosts: ["manhuafast.com"],
    selectors: [
      ".wp-manga-chapter a",
      ".listing-chapters_wrap li a",
      'a[href*="/chapter-"]',
    ],
  },
];

export const GENERIC_CHAPTER_SELECTORS = [
  ".wp-manga-chapter a",
  ".listing-chapters_wrap li a",
  ".eplister li a",
  ".eph-num a",
  ".bxcl ul li a",
  'a[href*="chapter-"]',
  'a[href*="/chapter/"]',
];

const MAX_TRACKER_NUMBER = 10000;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function getRuleForHost(host: string): ScraperRule | undefined {
  const normalized = normalizeHost(host);
  return SCRAPER_RULES.find((rule) =>
    rule.hosts.some((ruleHost) => normalizeHost(ruleHost) === normalized),
  );
}

function toValidTrackerNumber(value: string): number | null {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0 || num >= MAX_TRACKER_NUMBER) {
    return null;
  }
  return num;
}

function maxCandidate(candidates: Array<string | undefined>): number | null {
  const nums = candidates
    .filter((value): value is string => Boolean(value))
    .map(toValidTrackerNumber)
    .filter((value): value is number => value !== null);

  return nums.length > 0 ? Math.max(...nums) : null;
}

export function extractChapterNumberFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.includes("{{")) return null;

  const relativeAge = [
    ...normalized.matchAll(
      /(?:chapter|chap(?:ter)?|ch\.?|episode|ep\.?)\s*[:#.\-]?\s*(\d+(?:\.\d+)?)(?:\d+\s*(?:day|days|week|weeks|month|months|year|years)\s+ago)/gi,
    ),
  ].map((match) => match[1]);
  const relativeAgeNumber = maxCandidate(relativeAge);
  if (relativeAgeNumber !== null) return relativeAgeNumber;

  const candidates = [
    ...normalized.matchAll(
      /(?:chapter|chap(?:ter)?|ch\.?|episode|ep\.?)\s*[:#.\-]?\s*(\d+(?:\.\d+)?)/gi,
    ),
    ...normalized.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:\[[^\]]+\]\s*)?(?:chapter|chap(?:ter)?|ch\.?|episode|ep\.?)/gi,
    ),
    ...normalized.matchAll(/\[(\d+(?:\.\d+)?)\]/g),
  ].map((match) => match[1]);

  return maxCandidate(candidates);
}

export function extractChapterNumberFromHref(
  href: string,
  baseUrl: string,
): number | null {
  try {
    const parsed = new URL(href, baseUrl);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    const candidates = [
      ...path.matchAll(
        /(?:^|[/-])(?:chapter|chap|ch|episode|ep)[-/]?(\d+(?:\.\d+)?)(?=$|[/-])/gi,
      ),
      ...path.matchAll(
        /(?:chapter|chap|ch|episode|ep)[-/](\d+(?:\.\d+)?)(?=$|[/-])/gi,
      ),
    ].map((match) => match[1]);

    return maxCandidate(candidates);
  } catch {
    return null;
  }
}

export function collectChapterNumbers(
  $: cheerio.CheerioAPI,
  trackerUrl: string,
  selectors: string[],
): number[] {
  const seen = new Set<string>();
  const numbers: number[] = [];
  const trackerHost = normalizeHost(new URL(trackerUrl).host);

  for (const selector of selectors) {
    $(selector).each((_i, el) => {
      const node = $(el);
      const href = node.attr("href") || node.find("a").attr("href") || "";
      const text = node.text().replace(/\s+/g, " ").trim();
      const key = `${href}::${text}`;
      if ((!href && !text) || text.includes("{{") || seen.has(key)) return;
      seen.add(key);

      if (href) {
        try {
          const parsedHref = new URL(href, trackerUrl);
          if (normalizeHost(parsedHref.host) !== trackerHost) return;
        } catch {
          return;
        }
      }

      const fromHref = href
        ? extractChapterNumberFromHref(href, trackerUrl)
        : null;
      if (fromHref !== null) {
        numbers.push(fromHref);
        return;
      }

      const fromText = extractChapterNumberFromText(text);
      if (fromText !== null) numbers.push(fromText);
    });
  }

  return Array.from(new Set(numbers));
}

export function extractEpisodeNumberFromText(text: string): number | null {
  return extractChapterNumberFromText(text);
}
