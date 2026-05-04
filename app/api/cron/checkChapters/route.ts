import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { MediaItem, User } from "@/lib/models";
import {
  sendTelegram,
  sendTelegramToChat,
  escapeHtml,
} from "@/lib/notify";
import { jsonOk, jsonError } from "@/lib/http";
import { logInfo, logInternalError } from "@/lib/log";
import * as cheerio from "cheerio";

const MAX_USERS = 50;
const MAX_ENTRIES_PER_RUN = 200;

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_RETRY_ATTEMPTS = 2;
const FETCH_RETRY_BASE_DELAY_MS = 400;
const HOST_COOLDOWN_MS = 10 * 60 * 1000;
const hostCooldownUntil = new Map<string, number>();

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

    const delayMs = FETCH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delayMs);
  }

  throw lastError || new Error("fetch_retry_failed");
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
};

// ══════════════════════════════════════════════════════════════════
//  MANHWA — chapter scraping
// ══════════════════════════════════════════════════════════════════

type ScraperRule = {
  hosts: string[];
  selectors: string[];
};

const SCRAPER_RULES: ScraperRule[] = [
  {
    hosts: ["arenascan.com", "www.arenascan.com"],
    selectors: [".eplister li a", ".eph-num a", ".bxcl ul li a"],
  },
  {
    hosts: ["magicemperor.xyz", "www.magicemperor.xyz"],
    selectors: [".wp-manga-chapter a", ".listing-chapters_wrap li a"],
  },
  {
    hosts: ["magicemperors.com", "www.magicemperors.com"],
    selectors: [".last-chapter a", ".scroll-sm a", ".item a"],
  },
  {
    hosts: ["w14.levelingwithgods.com", "levelingwithgods.com"],
    selectors: ['a[href*="chapter-"]', 'a[href*="/manga/"]'],
  },
  {
    hosts: ["w2.infinitelevelup.com", "infinitelevelup.com"],
    selectors: ['a[href*="/manga/"][href*="chapter-"]'],
  },
  {
    hosts: ["manhuafast.com", "www.manhuafast.com"],
    selectors: [
      ".wp-manga-chapter a",
      ".listing-chapters_wrap li a",
      'a[href*="/chapter-"]',
    ],
  },
];

const GENERIC_CHAPTER_SELECTORS = [
  ".wp-manga-chapter a",
  ".listing-chapters_wrap li a",
  ".eplister li a",
  ".eph-num a",
  ".bxcl ul li a",
  'a[href*="chapter-"]',
  'a[href*="/chapter/"]',
];

function getRuleForHost(host: string): ScraperRule | undefined {
  return SCRAPER_RULES.find((rule) => rule.hosts.includes(host));
}

function extractChapterNumberFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.includes("{{")) return null;

  const match = normalized.match(
    /(?:chapter|chap(?:ter)?|ch\.?|episode|ep\.?)\s*[:#.\-]?\s*(\d+(?:\.\d+)?)/i,
  );
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num <= 0 || num >= 10000) return null;
  return num;
}

function extractChapterNumberFromHref(
  href: string,
  baseUrl: string,
): number | null {
  try {
    const parsed = new URL(href, baseUrl);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    const match =
      path.match(
        /(?:^|[/-])(?:chapter|chap|ch|episode|ep)-?\/?(\d+(?:\.\d+)?)(?:\/)?$/i,
      ) ||
      path.match(/(?:chapter|chap|ch|episode|ep)-(\d+(?:\.\d+)?)(?:\/)?$/i) ||
      path.match(/(?:chapter|chap|ch|episode|ep)\/(\d+(?:\.\d+)?)(?:\/)?$/i);
    if (!match) return null;

    const num = parseFloat(match[1]);
    if (!Number.isFinite(num) || num <= 0 || num >= 10000) return null;
    return num;
  } catch {
    return null;
  }
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

function collectChapterNumbers(
  $: cheerio.CheerioAPI,
  trackerUrl: string,
  selectors: string[],
): number[] {
  const seen = new Set<string>();
  const numbers: number[] = [];
  const trackerHost = new URL(trackerUrl).host;

  for (const selector of selectors) {
    $(selector).each((_i, el) => {
      const node = $(el);
      const href = node.attr("href") || node.find("a").attr("href") || "";
      const text = node.text().replace(/\s+/g, " ").trim();
      const key = `${href}::${text}`;
      if (!text || text.includes("{{") || seen.has(key)) return;
      seen.add(key);

      if (href) {
        try {
          const parsedHref = new URL(href, trackerUrl);
          if (parsedHref.host !== trackerHost) return;
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

    if (numbers.length > 0) return numbers;
  }

  return numbers;
}

async function scrapeManhwaTrackerUrl(
  trackerUrl: string,
): Promise<number | null> {
  const initialRes = await fetchWithRetry(trackerUrl, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
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

// ══════════════════════════════════════════════════════════════════
//  DONGHUA — episode scraping (animexin.dev)
// ══════════════════════════════════════════════════════════════════

const ANIMEXIN_HOST = "animexin.dev";

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

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  const lastInepcx = $(".lastend .inepcx").last();
  if (lastInepcx.length) {
    const text =
      lastInepcx.find(".epcur").last().text().trim() ||
      lastInepcx.text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  }

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  $("span.epcur").each((_i, el) => {
    const text = $(el).text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  });

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  const episodeMatches = html.matchAll(/Episode\s+(\d+)/gi);
  for (const match of episodeMatches) {
    const num = parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0 && num < 10000) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  throw new Error("No episode numbers found on animexin page");
}

function extractEpisodeNumberFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const match = normalized.match(
    /(?:episode|ep\.?)\s*[:#.\-]?\s*(\d+(?:\.\d+)?)/i,
  );
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num <= 0 || num >= 10000) return null;
  return num;
}

// ══════════════════════════════════════════════════════════════════
//  UNIFIED SCRAPER — dispatches by media_type
// ══════════════════════════════════════════════════════════════════

type MediaTypeSupported = "Manhwa" | "Donghua";

async function scrapeTrackerUrl(
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

// ══════════════════════════════════════════════════════════════════
//  SHARED TYPES
// ══════════════════════════════════════════════════════════════════

type ChapterUpdate = {
  title: string;
  latest: number;
  current: number;
  tracker_url: string;
  media_type: MediaTypeSupported;
};

function progressUnit(mediaType: MediaTypeSupported): string {
  return mediaType === "Donghua" ? "Episode" : "Chapter";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

// ══════════════════════════════════════════════════════════════════
//  CRON HANDLER (Next.js App Router)
// ══════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return jsonError(
      "CRON_SECRET_MISSING",
      "Cron endpoint is not configured",
      500,
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return jsonError("UNAUTHORIZED", "Unauthorized", 401);
  }

  try {
    logInfo("cron_check_chapters_start", {
      at: new Date().toISOString(),
      user_agent: req.headers.get("user-agent") || "",
      request_id: req.headers.get("x-vercel-id") || "",
    });

    await connectDB();

    const entries = await MediaItem.find({
      media_type: { $in: ["Manhwa", "Donghua"] },
      status: "Active",
      tracker_url: { $exists: true, $nin: [null, ""] },
    })
      .select("title progress_current tracker_url user_id media_type")
      .limit(MAX_ENTRIES_PER_RUN)
      .lean();

    if (entries.length === 0) {
      return jsonOk({
        checked: 0,
        users_scanned: 0,
        users_notified: 0,
        failures: 0,
        message: "No entries to check",
      });
    }

    const byUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      const uid = String(entry.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(entry);
    }

    const userIds = Array.from(byUser.keys()).slice(0, MAX_USERS);

    const users = await User.find({ _id: { $in: userIds } })
      .select("_id username notifications_enabled telegram_chat_id")
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const updatesByUser = new Map<string, ChapterUpdate[]>();
    const errorsByUser = new Map<
      string,
      { title: string; message: string }[]
    >();
    let totalChecked = 0;

    for (const uid of userIds) {
      const userEntries = byUser.get(uid) || [];
      const updates: ChapterUpdate[] = [];
      const errors: { title: string; message: string }[] = [];

      for (const entry of userEntries) {
        const mediaType = entry.media_type as MediaTypeSupported;
        const trackerUrl = String(entry.tracker_url || "");
        const host = getHostFromUrl(trackerUrl);
        const cooldownUntil = host ? hostCooldownUntil.get(host) || 0 : 0;

        try {
          if (cooldownUntil > Date.now()) {
            throw new Error(
              `Host cooldown active for ${host} (${Math.ceil((cooldownUntil - Date.now()) / 1000)}s remaining)`,
            );
          }

          const latest = await scrapeTrackerUrl(trackerUrl, mediaType);
          totalChecked++;

          if (latest !== null && latest > (entry.progress_current as number)) {
            updates.push({
              title: entry.title as string,
              latest,
              current: entry.progress_current as number,
              tracker_url: trackerUrl,
              media_type: mediaType,
            });
          }
        } catch (err) {
          if (host) {
            hostCooldownUntil.set(host, Date.now() + HOST_COOLDOWN_MS);
          }
          errors.push({
            title: entry.title as string,
            message: getErrorMessage(err),
          });
        }

        await sleep(mediaType === "Donghua" ? 500 : 300);
      }

      if (updates.length > 0) updatesByUser.set(uid, updates);
      if (errors.length > 0) errorsByUser.set(uid, errors);
    }

    let usersNotified = 0;
    let failures = 0;
    const globalFallbackUpdates: {
      username: string;
      updates: ChapterUpdate[];
      errors: { title: string; message: string }[];
    }[] = [];

    for (const uid of new Set([
      ...updatesByUser.keys(),
      ...errorsByUser.keys(),
    ])) {
      const updates = updatesByUser.get(uid) || [];
      const errors = errorsByUser.get(uid) || [];
      const user = userMap.get(uid);
      const username = user?.username || "Unknown";
      const notificationsEnabled = !!user?.notifications_enabled;
      const hasPersonalChat = !!user?.telegram_chat_id;

      const message = buildNotificationMessage(username, updates, errors);

      if (!notificationsEnabled) {
        continue;
      }

      if (hasPersonalChat) {
        const ok = await sendTelegramToChat(user.telegram_chat_id as string, message);
        if (ok) usersNotified++;
        else failures++;
      } else {
        globalFallbackUpdates.push({ username, updates, errors });
      }
    }

    if (globalFallbackUpdates.length > 0) {
      const allLines: string[] = [];
      let totalUpdates = 0;

      for (const { username, updates, errors } of globalFallbackUpdates) {
        totalUpdates += updates.length;
        allLines.push(`👤 <b>${escapeHtml(username)}</b>`);

        const manhwa = updates.filter((u) => u.media_type === "Manhwa");
        const donghua = updates.filter((u) => u.media_type === "Donghua");

        const sections = [
          formatMediaSection("Manhwa", "📖", manhwa),
          formatMediaSection("Donghua", "🎬", donghua),
          formatErrorSection(errors),
        ].filter((v): v is string => Boolean(v));

        if (sections.length > 0) {
          allLines.push(sections.join("\n\n"));
        }

        allLines.push("");
      }

      const globalMessage = [
        `━━━━ 🔔 <b>Chronicle Global Updates</b> ━━━━`,
        ``,
        ...allLines,
        `━━ <i>✨ Total: ${totalUpdates} update${totalUpdates !== 1 ? "s" : ""}</i> ━━`,
      ].join("\n");

      const ok = await sendTelegram(globalMessage);
      if (ok) usersNotified += globalFallbackUpdates.length;
      else failures += globalFallbackUpdates.length;
    }

    const payload = {
      checked: totalChecked,
      users_scanned: userIds.length,
      users_notified: usersNotified,
      failures,
      updates_by_user: Object.fromEntries(
        Array.from(updatesByUser.entries()).map(([uid, updates]) => {
          const user = userMap.get(uid);
          return [user?.username || uid, updates];
        }),
      ),
    };

    logInfo("cron_check_chapters_complete", {
      at: new Date().toISOString(),
      checked: payload.checked,
      users_scanned: payload.users_scanned,
      users_notified: payload.users_notified,
      failures: payload.failures,
    });

    return jsonOk(payload);
  } catch (err) {
    logInternalError("cron_check_chapters", err, {
      route: "cron/checkChapters",
    });
    return jsonError("CRON_ERROR", "Internal server error", 500);
  }
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATION HELPERS
// ══════════════════════════════════════════════════════════════════

function formatUpdateItem(update: ChapterUpdate): string {
  const unread = Math.max(0, Math.floor(update.latest - update.current));
  const unreadStr = unread > 0 ? ` (+${unread})` : "";
  const unit = progressUnit(update.media_type);

  return `• <a href="${escapeHtml(update.tracker_url)}">${escapeHtml(update.title)}</a> — ${unit} ${update.current}${unreadStr}`;
}

function formatMediaSection(
  label: string,
  icon: string,
  items: ChapterUpdate[],
): string | null {
  if (items.length === 0) return null;

  return [
    `${icon} <b>${label}</b> <i>(${items.length})</i>`,
    ...items.map(formatUpdateItem),
  ].join("\n");
}

function formatErrorSection(
  errors: { title: string; message: string }[],
): string | null {
  if (errors.length === 0) return null;

  return [
    `⚠️ <b>Tracker Errors</b>`,
    ...errors.map(
      (e) => `• <i>${escapeHtml(e.title)}</i>: ${escapeHtml(e.message)}`,
    ),
  ].join("\n");
}

function buildNotificationMessage(
  username: string,
  updates: ChapterUpdate[],
  errors: { title: string; message: string }[],
): string {
  const manhwa = updates.filter((u) => u.media_type === "Manhwa");
  const donghua = updates.filter((u) => u.media_type === "Donghua");

  const parts = [
    `━━━━ 🔔 <b>${escapeHtml(username)} Updates</b> ━━━━`,
    formatMediaSection("Manhwa", "📖", manhwa),
    formatMediaSection("Donghua", "🎬", donghua),
    formatErrorSection(errors),
    `━━ <i>✨ Total: ${updates.length} update${updates.length !== 1 ? "s" : ""}</i> ━━`,
  ].filter((v): v is string => Boolean(v));

  return parts.join("\n\n");
}
