import * as cheerio from "cheerio";
import {
  collectChapterNumbers,
  extractEpisodeNumberFromText,
  GENERIC_CHAPTER_SELECTORS,
  getRuleForHost,
} from "@/lib/scraper";

const FETCH_TIMEOUT_MS = 12_000;
const FETCH_RETRY_ATTEMPTS = 2;
const FETCH_RETRY_BASE_DELAY_MS = 900;
const ANIMEXIN_HOST = "animexin.dev";
const SLOW_HOST_TIMEOUT_MS = 20_000;
const SLOW_HOSTS = new Set([
  "arenascan.com",
  "magicemperors.com",
]);

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
};

export type MediaTypeSupported = "Manhwa" | "Donghua";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Fetch timeout after ${timeoutMs}ms for ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function getFetchTimeoutMs(url: string): number {
  try {
    const host = normalizeHost(new URL(url).host);
    return SLOW_HOSTS.has(host) ? SLOW_HOST_TIMEOUT_MS : FETCH_TIMEOUT_MS;
  } catch {
    return FETCH_TIMEOUT_MS;
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= FETCH_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (
        res.ok ||
        !shouldRetryStatus(res.status) ||
        attempt === FETCH_RETRY_ATTEMPTS
      ) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("fetch_error");
      if (attempt === FETCH_RETRY_ATTEMPTS) break;
    }

    const jitterMs = Math.floor(Math.random() * 250);
    const delayMs = FETCH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitterMs;
    await sleep(delayMs);
  }

  throw lastError || new Error("fetch_retry_failed");
}

async function fetchManhuafastChapters(trackerUrl: string): Promise<string> {
  const ajaxUrl = new URL("ajax/chapters/", trackerUrl).toString();
  const res = await fetchWithRetry(ajaxUrl, {
    method: "POST",
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

async function scrapeManhwaTrackerUrl(
  trackerUrl: string,
): Promise<number | null> {
  const initialRes = await fetchWithRetry(
    trackerUrl,
    {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    },
    getFetchTimeoutMs(trackerUrl),
  );
  if (!initialRes.ok) {
    throw new Error(`HTTP ${initialRes.status}: ${initialRes.statusText}`);
  }

  const resolvedUrl = initialRes.url;
  const host = new URL(resolvedUrl).host;
  const html =
    host === "manhuafast.com" || host === "www.manhuafast.com"
      ? await fetchManhuafastChapters(resolvedUrl)
      : await initialRes.text();

  const $ = cheerio.load(html);
  const preferredSelectors =
    getRuleForHost(host)?.selectors || GENERIC_CHAPTER_SELECTORS;
  let chapterNumbers = collectChapterNumbers(
    $,
    resolvedUrl,
    preferredSelectors,
  );

  if (
    chapterNumbers.length === 0 &&
    preferredSelectors !== GENERIC_CHAPTER_SELECTORS
  ) {
    chapterNumbers = collectChapterNumbers(
      $,
      resolvedUrl,
      GENERIC_CHAPTER_SELECTORS,
    );
  }

  if (chapterNumbers.length === 0) {
    throw new Error("No chapter numbers found in DOM");
  }
  return Math.max(...chapterNumbers);
}

async function scrapeAnimexinTrackerUrl(
  trackerUrl: string,
): Promise<number | null> {
  const res = await fetchWithRetry(trackerUrl, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: "https://animexin.dev/",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const resolvedHost = new URL(res.url).host;
  if (!resolvedHost.includes(ANIMEXIN_HOST)) {
    throw new Error(
      `Tracker URL redirected off animexin.dev to ${resolvedHost}`,
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates: number[] = [];

  $(".epcur.epcurlast").each((_i, el) => {
    const text = $(el).text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  });

  const lastInepcx = $(".lastend .inepcx").last();
  if (lastInepcx.length) {
    const text =
      lastInepcx.find(".epcur").last().text().trim() ||
      lastInepcx.text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  }

  $("span.epcur").each((_i, el) => {
    const text = $(el).text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  });

  const episodeMatches = html.matchAll(/(?:Episode\s+(\d+)|(\d+)\s*(?:\[[^\]]+\]\s*)?Episode)/gi);
  for (const match of episodeMatches) {
    const raw = match[1] || match[2];
    const num = parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0 && num < 10000) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  throw new Error("No episode numbers found on animexin page");
}

export async function scrapeTrackerUrl(
  trackerUrl: string,
  mediaType: MediaTypeSupported,
): Promise<number | null> {
  try {
    if (mediaType === "Donghua") {
      return await scrapeAnimexinTrackerUrl(trackerUrl);
    }
    return await scrapeManhwaTrackerUrl(trackerUrl);
  } catch (error) {
    throw new Error(`Scraper failed [${mediaType}]: ${getErrorMessage(error)}`);
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

export function isTransientScrapeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("fetch timeout") ||
    message.includes("fetch_retry_failed") ||
    message.includes("http 429") ||
    /http 5\d\d/.test(message)
  );
}
