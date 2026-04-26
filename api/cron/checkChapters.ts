import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem, User } from "../_utils/db.js";
import {
  sendTelegram,
  sendTelegramToChat,
  escapeHtml,
} from "../_utils/notify.js";
import { jsonOk, jsonError } from "../_utils/http.js";
import { logInternalError } from "../_utils/log.js";
import * as cheerio from "cheerio";

/**
 * Vercel Cron — runs daily at 9AM IST
 * Schedule set in vercel.json: "30 3 * * *" (03:30 UTC = 09:00 IST)
 *
 * Checks:
 *   - Manhwa entries with tracker_url → scrapes chapter number
 *   - Donghua entries with tracker_url → scrapes episode number from animexin.dev
 *
 * If latest number > progress_current, queues a notification per user.
 * Does NOT auto-update progress_current — that stays manual.
 */

const MAX_USERS = 50;
const MAX_ENTRIES_PER_RUN = 200;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
};

// ══════════════════════════════════════════════════════════════════
//  MANHWA — chapter scraping (existing logic, unchanged)
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
  const res = await fetch(ajaxUrl, {
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
  const initialRes = await fetch(trackerUrl, {
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

/**
 * Scrapes animexin.dev show page for the latest episode number.
 *
 * The page contains a structure like:
 *   <div class="lastend">
 *     <div class="inepcx">
 *       <a href="#">
 *         <span>First Episode</span>
 *         <span class="epcur epcurfirst">Episode 1</span>
 *       </a>
 *     </div>
 *     <div class="inepcx">
 *       <a href="https://animexin.dev/some-show-episode-137-.../">
 *         <span>New Episode</span>
 *         <span class="epcur epcurlast">Episode 137</span>
 *       </a>
 *     </div>
 *   </div>
 *
 * Strategy (in priority order):
 *   1. .epcur.epcurlast text  → "Episode 137" → 137
 *   2. .lastend .inepcx last child span.epcur text
 *   3. Any span.epcur text — take the max
 *   4. Regex scan of full HTML source for "Episode NNN"
 */
async function scrapeAnimexinTrackerUrl(
  trackerUrl: string,
): Promise<number | null> {
  const res = await fetch(trackerUrl, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: "https://animexin.dev/",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  // Validate we're still on animexin
  const resolvedHost = new URL(res.url).host;
  if (!resolvedHost.includes(ANIMEXIN_HOST)) {
    throw new Error(
      `Tracker URL redirected off animexin.dev to ${resolvedHost}`,
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates: number[] = [];

  // Strategy 1 — .epcur.epcurlast (the "New Episode" span, most reliable)
  $(".epcur.epcurlast").each((_i, el) => {
    const text = $(el).text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  });

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  // Strategy 2 — last .inepcx inside .lastend
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

  // Strategy 3 — any span.epcur on the page, take the max
  $("span.epcur").each((_i, el) => {
    const text = $(el).text().trim();
    const num = extractEpisodeNumberFromText(text);
    if (num !== null) candidates.push(num);
  });

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }

  // Strategy 4 — raw HTML regex scan for "Episode NNN"
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

/**
 * Extract episode number from text like:
 *   "Episode 137", "Ep 12", "EP.5", "Episode 3.5"
 */
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
  } catch (error: any) {
    throw new Error(`Scraper failed [${mediaType}]: ${error.message}`);
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

/** Returns "Episode" for Donghua, "Chapter" for everything else */
function progressUnit(mediaType: MediaTypeSupported): string {
  return mediaType === "Donghua" ? "Episode" : "Chapter";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════════════════
//  CRON HANDLER
// ══════════════════════════════════════════════════════════════════

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
  }

  try {
    console.log("cron_check_chapters_start", {
      at: new Date().toISOString(),
      user_agent: req.headers["user-agent"] || "",
      request_id: req.headers["x-vercel-id"] || "",
    });

    await connectDB();

    // ── Fetch both Manhwa AND Donghua entries with tracker URLs ──
    const entries = await MediaItem.find({
      media_type: { $in: ["Manhwa", "Donghua"] },
      status: "Watching/Reading",
      tracker_url: { $exists: true, $nin: [null, ""] },
    })
      .select("title progress_current tracker_url user_id media_type")
      .limit(MAX_ENTRIES_PER_RUN)
      .lean();

    if (entries.length === 0) {
      return jsonOk(res, {
        checked: 0,
        users_scanned: 0,
        users_notified: 0,
        failures: 0,
        message: "No entries to check",
      });
    }

    // ── Group by user ────────────────────────────────────────────
    const byUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      const uid = String(entry.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(entry);
    }

    const userIds = Array.from(byUser.keys()).slice(0, MAX_USERS);

    // ── Fetch user notification settings ─────────────────────────
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id username notifications_enabled telegram_chat_id")
      .lean();

    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    // ── Scrape each entry ────────────────────────────────────────
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
        const mediaType = (entry as any).media_type as MediaTypeSupported;
        const trackerUrl = (entry as any).tracker_url as string;

        try {
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
        } catch (err: any) {
          errors.push({
            title: entry.title as string,
            message: err.message,
          });
        }

        // Longer delay for animexin to avoid rate limiting
        await sleep(mediaType === "Donghua" ? 500 : 300);
      }

      if (updates.length > 0) updatesByUser.set(uid, updates);
      if (errors.length > 0) errorsByUser.set(uid, errors);
    }

    // ── Build & send per-user notifications ──────────────────────
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
      const user = userMap.get(uid) as any;
      const username = user?.username || "Unknown";
      const notificationsEnabled = !!user?.notifications_enabled;
      const hasPersonalChat = !!user?.telegram_chat_id;

      const message = buildNotificationMessage(username, updates, errors);

      if (!notificationsEnabled) {
        continue;
      }

      if (hasPersonalChat) {
        const ok = await sendTelegramToChat(user.telegram_chat_id, message);
        if (ok) usersNotified++;
        else failures++;
      } else {
        globalFallbackUpdates.push({ username, updates, errors });
      }
    }

    // ── Global fallback ──────────────────────────────────────────
    if (globalFallbackUpdates.length > 0) {
      const allLines: string[] = [];
      let totalUpdates = 0;

      for (const { username, updates, errors } of globalFallbackUpdates) {
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
          const user = userMap.get(uid) as any;
          return [user?.username || uid, updates];
        }),
      ),
    };

    console.log("cron_check_chapters_complete", {
      at: new Date().toISOString(),
      checked: payload.checked,
      users_scanned: payload.users_scanned,
      users_notified: payload.users_notified,
      failures: payload.failures,
    });

    return jsonOk(res, payload);
  } catch (err) {
    logInternalError("cron_check_chapters", err, {
      route: "cron/checkChapters",
    });
    return jsonError(res, "CRON_ERROR", "Internal server error", 500);
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
