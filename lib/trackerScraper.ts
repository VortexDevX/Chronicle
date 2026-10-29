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

export type ScrapeTrackerOptions = {
  signal?: AbortSignal;
  retryAttempts?: number;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Scrape cancelled by caller");
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Scrape cancelled by caller"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (signal?.aborted) throw new Error("Scrape cancelled by caller");
      throw new Error(`Fetch timeout after ${timeoutMs}ms for ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
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
  options: ScrapeTrackerOptions = {},
): Promise<Response> {
  let lastError: Error | null = null;
  const retryAttempts = Math.min(
    FETCH_RETRY_ATTEMPTS,
    Math.max(0, Math.floor(options.retryAttempts ?? FETCH_RETRY_ATTEMPTS)),
  );

  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    throwIfAborted(options.signal);
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs, options.signal);
      if (
        res.ok ||
        !shouldRetryStatus(res.status) ||
        attempt === retryAttempts
      ) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("fetch_error");
      if (attempt === retryAttempts) break;
    }

    const jitterMs = Math.floor(Math.random() * 250);
    const delayMs = FETCH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitterMs;
    await sleep(delayMs, options.signal);
  }

  throw lastError || new Error("fetch_retry_failed");
}

type ProxyResult = {
  html: string;
  resolvedUrl: string;
};

async function fetchViaVpsProxy(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
  options: ScrapeTrackerOptions = {},
): Promise<ProxyResult | null> {
  const proxyEndpoint = process.env.CHRONICLE_SCRAPER_PROXY_URL;
  const proxyKey = process.env.CHRONICLE_SCRAPER_PROXY_KEY;

  if (!proxyEndpoint || !proxyKey) {
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      proxyEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chronicle-proxy-key": proxyKey,
        },
        body: JSON.stringify({
          url,
          method: init?.method || "GET",
          headers: init?.headers,
          body: init?.body,
        }),
      },
      FETCH_TIMEOUT_MS,
      options.signal,
    );

    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        status?: number;
        resolvedUrl?: string;
        body?: string;
      };
      if (data.ok && typeof data.body === "string" && data.body.length > 50) {
        return {
          html: data.body,
          resolvedUrl: data.resolvedUrl || url,
        };
      }
    }
  } catch {
    // continue to next proxy fallback
  }

  return null;
}

async function fetchProxyContent(
  url: string,
  options: ScrapeTrackerOptions = {},
): Promise<string | null> {
  const vpsResult = await fetchViaVpsProxy(url, undefined, options);
  if (vpsResult) {
    return vpsResult.html;
  }

  const proxyUrl = `https://r.jina.ai/${url}`;

  try {
    const res = await fetchWithTimeout(
      proxyUrl,
      {
        headers: {
          "x-return-format": "html",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      },
      FETCH_TIMEOUT_MS,
      options.signal,
    );
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 500 && !text.includes("window.location.hostname !==")) {
        return text;
      }
    }
  } catch {
    // ignore
  }

  try {
    const mdRes = await fetchWithTimeout(
      proxyUrl,
      {
        headers: {
          Accept: "text/plain,*/*;q=0.8",
        },
      },
      FETCH_TIMEOUT_MS,
      options.signal,
    );
    if (mdRes.ok) {
      const mdText = await mdRes.text();
      if (mdText && mdText.length > 50) {
        return mdText;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/** Shared HTML transport for source adapters. Keeps timeout, retry, abort behaviour central. */
export async function fetchTrackerUrlHtml(
  url: string,
  options: ScrapeTrackerOptions = {},
): Promise<{ html: string; resolvedUrl: string }> {
  try {
    const res = await fetchWithRetry(
      url,
      { headers: BROWSER_HEADERS, redirect: "follow" },
      getFetchTimeoutMs(url),
      options,
    );
    if (res.status === 403 || res.status === 503) {
      const vpsResult = await fetchViaVpsProxy(url, undefined, options);
      if (vpsResult) {
        return vpsResult;
      }
      const proxyHtml = await fetchProxyContent(url, options);
      if (proxyHtml) {
        return { html: proxyHtml, resolvedUrl: url };
      }
      const host = normalizeHost(new URL(url).host);
      throw new Error(`HTTP 403 Forbidden on ${host}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return { html: await res.text(), resolvedUrl: res.url };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("fetch_error")) {
      const vpsResult = await fetchViaVpsProxy(url, undefined, options);
      if (vpsResult) {
        return vpsResult;
      }
      const proxyHtml = await fetchProxyContent(url, options);
      if (proxyHtml) {
        return { html: proxyHtml, resolvedUrl: url };
      }
    }
    throw err;
  }
}

async function fetchManhuafastChapters(
  trackerUrl: string,
  options: ScrapeTrackerOptions,
): Promise<string> {
  const ajaxUrl = new URL("ajax/chapters/", trackerUrl).toString();
  try {
    const res = await fetchWithRetry(
      ajaxUrl,
      {
        method: "POST",
        headers: BROWSER_HEADERS,
        redirect: "follow",
      },
      FETCH_TIMEOUT_MS,
      options,
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 503) {
        const vpsResult = await fetchViaVpsProxy(
          ajaxUrl,
          { method: "POST", headers: BROWSER_HEADERS },
          options,
        );
        if (vpsResult) return vpsResult.html;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  } catch (err) {
    const vpsResult = await fetchViaVpsProxy(
      ajaxUrl,
      { method: "POST", headers: BROWSER_HEADERS },
      options,
    );
    if (vpsResult) return vpsResult.html;
    throw err;
  }
}

async function scrapeManhwaTrackerUrl(
  trackerUrl: string,
  options: ScrapeTrackerOptions,
): Promise<number | null> {
  const host = new URL(trackerUrl).host;
  let resolvedUrl = trackerUrl;
  let html: string;

  if (host === "manhuafast.com" || host === "www.manhuafast.com") {
    html = await fetchManhuafastChapters(resolvedUrl, options);
  } else {
    try {
      const initialRes = await fetchWithRetry(
        trackerUrl,
        {
          headers: BROWSER_HEADERS,
          redirect: "follow",
        },
        getFetchTimeoutMs(trackerUrl),
        options,
      );

      if (initialRes.status === 403 || initialRes.status === 503) {
        const proxyHtml = await fetchProxyContent(trackerUrl, options);
        if (proxyHtml) {
          html = proxyHtml;
        } else {
          throw new Error(`HTTP 403 Forbidden on ${host}`);
        }
      } else if (!initialRes.ok) {
        throw new Error(`HTTP ${initialRes.status}: ${initialRes.statusText}`);
      } else {
        resolvedUrl = initialRes.url || trackerUrl;
        html = await initialRes.text();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("fetch_error")) {
        const proxyHtml = await fetchProxyContent(trackerUrl, options);
        if (proxyHtml) {
          html = proxyHtml;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

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

async function scrapeDonghuaTrackerUrl(
  trackerUrl: string,
  options: ScrapeTrackerOptions,
): Promise<number | null> {
  const host = new URL(trackerUrl).host.toLowerCase().replace(/^www\./, "");
  const isAnimexin = host.includes("animexin");
  let html: string;

  try {
    const res = await fetchWithRetry(
      trackerUrl,
      {
        headers: {
          ...BROWSER_HEADERS,
          Referer: isAnimexin ? "https://animexin.dev/" : trackerUrl,
        },
        redirect: "follow",
      },
      isAnimexin ? FETCH_TIMEOUT_MS : SLOW_HOSTS.has(host) ? SLOW_HOST_TIMEOUT_MS : FETCH_TIMEOUT_MS,
      options,
    );

    if (res.status === 403 || res.status === 503) {
      const proxyContent = await fetchProxyContent(trackerUrl, options);
      if (proxyContent) {
        html = proxyContent;
      } else {
        if (isAnimexin) {
          throw new Error("HTTP 403 Forbidden: animexin is Cloudflare protected.");
        }
        throw new Error(`HTTP 403 Forbidden on ${host}`);
      }
    } else if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } else {
      html = await res.text();
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("fetch_error")) {
      const proxyContent = await fetchProxyContent(trackerUrl, options);
      if (proxyContent) {
        html = proxyContent;
      } else {
        if (isAnimexin) {
          throw new Error("HTTP 403 Forbidden: animexin is Cloudflare protected.");
        }
        throw err;
      }
    } else {
      throw err;
    }
  }

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

  const preferredSelectors =
    getRuleForHost(host)?.selectors || GENERIC_CHAPTER_SELECTORS;
  let numbers = collectChapterNumbers($, trackerUrl, preferredSelectors);
  if (numbers.length === 0 && preferredSelectors !== GENERIC_CHAPTER_SELECTORS) {
    numbers = collectChapterNumbers($, trackerUrl, GENERIC_CHAPTER_SELECTORS);
  }
  candidates.push(...numbers);

  const episodeMatches = html.matchAll(/(?:Episode\s+(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\[[^\]]+\]\s*)?Episode)/gi);
  for (const match of episodeMatches) {
    const raw = match[1] || match[2];
    const num = parseFloat(raw);
    if (Number.isFinite(num) && num > 0 && num < 10000) {
      candidates.push(num);
    }
  }

  const urlEpisodeMatch = trackerUrl.match(/episode-(\d+(?:\.\d+)?)/i);
  if (urlEpisodeMatch) {
    const num = parseFloat(urlEpisodeMatch[1]);
    if (Number.isFinite(num) && num > 0 && num < 10000) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  throw new Error("No episode numbers found on page");
}

export async function scrapeTrackerUrl(
  trackerUrl: string,
  mediaType: MediaTypeSupported,
  options: ScrapeTrackerOptions = {},
): Promise<number | null> {
  try {
    if (mediaType === "Donghua") {
      return await scrapeDonghuaTrackerUrl(trackerUrl, options);
    }
    return await scrapeManhwaTrackerUrl(trackerUrl, options);
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
    message.includes("scrape cancelled by caller") ||
    message.includes("fetch_retry_failed") ||
    message.includes("http 429") ||
    /http 5\d\d/.test(message)
  );
}
