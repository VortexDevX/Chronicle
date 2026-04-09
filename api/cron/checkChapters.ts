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
 * For each Manhwa entry that:
 *   - has status "Watching/Reading"
 *   - has a tracker_url set
 *
 * Scrapes the tracker URL for the latest chapter number.
 * If latest chapter number > progress_current, queues a notification.
 *
 * Notifications are grouped per-user:
 *   - Users with notifications_enabled + telegram_chat_id get their own message.
 *   - Remaining updates go to the global TELEGRAM_CHAT_ID fallback (if set).
 *
 * Does NOT auto-update progress_current — that stays manual.
 */

// Hard caps to avoid serverless timeout
const MAX_USERS = 50;
const MAX_ENTRIES_PER_RUN = 200;

// Scrape a tracker URL to find the latest chapter number
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
};

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
    hosts: ["w14.levelingwithgods.com", "levelingwithgods.com"],
    selectors: ['a[href*="/manga/"][href*="chapter-"]'],
  },
  {
    hosts: ["w2.infinitelevelup.com", "infinitelevelup.com"],
    selectors: ['a[href*="/manga/"][href*="chapter-"]'],
  },
];

const GENERIC_CHAPTER_SELECTORS = [
  '.wp-manga-chapter a',
  '.listing-chapters_wrap li a',
  '.eplister li a',
  '.eph-num a',
  '.bxcl ul li a',
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

function extractChapterNumberFromHref(href: string, baseUrl: string): number | null {
  try {
    const parsed = new URL(href, baseUrl);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    const match = path.match(
      /(?:chapter|chap|ch|episode|ep)[-/](\d+(?:\.\d+)?)(?:\/)?$/i,
    );
    if (!match) return null;

    const num = parseFloat(match[1]);
    if (!Number.isFinite(num) || num <= 0 || num >= 10000) return null;
    return num;
  } catch {
    return null;
  }
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

      const fromHref = href ? extractChapterNumberFromHref(href, trackerUrl) : null;
      if (fromHref !== null) {
        numbers.push(fromHref);
        return;
      }

      const fromText = extractChapterNumberFromText(text);
      if (fromText !== null) {
        numbers.push(fromText);
      }
    });

    if (numbers.length > 0) {
      return numbers;
    }
  }

  return numbers;
}

async function scrapeTrackerUrl(trackerUrl: string): Promise<number | null> {
  try {
    const res = await fetch(trackerUrl, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const host = new URL(res.url).host;
    const preferredSelectors =
      getRuleForHost(host)?.selectors || GENERIC_CHAPTER_SELECTORS;
    let chapterNumbers = collectChapterNumbers($, res.url, preferredSelectors);

    if (chapterNumbers.length === 0 && preferredSelectors !== GENERIC_CHAPTER_SELECTORS) {
      chapterNumbers = collectChapterNumbers($, res.url, GENERIC_CHAPTER_SELECTORS);
    }

    if (chapterNumbers.length === 0) {
      throw new Error("No chapter numbers found in DOM");
    }
    return Math.max(...chapterNumbers);
  } catch (error: any) {
    throw new Error(`Scraper failed: ${error.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ChapterUpdate = {
  title: string;
  latest: number;
  current: number;
  tracker_url: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  // Vercel Cron sends Authorization header with CRON_SECRET
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

    // Fetch all Manhwa entries that are actively being read and have a tracker URL
    const entries = await MediaItem.find({
      media_type: "Manhwa",
      status: "Watching/Reading",
      tracker_url: { $exists: true, $nin: [null, ""] },
    })
      .select("title progress_current tracker_url user_id")
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

    // ── Group entries by user_id ──────────────────────────────────

    const byUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      const uid = String(entry.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(entry);
    }

    // Enforce user cap
    const userIds = Array.from(byUser.keys()).slice(0, MAX_USERS);

    // ── Fetch user notification settings ─────────────────────────

    const users = await User.find({ _id: { $in: userIds } })
      .select("_id username notifications_enabled telegram_chat_id")
      .lean();

    const userMap = new Map(
      users.map((u: any) => [String(u._id), u]),
    );

    // ── Check chapters for each entry ────────────────────────────

    const updatesByUser = new Map<string, ChapterUpdate[]>();
    const errorsByUser = new Map<string, { title: string; message: string }[]>();
    let totalChecked = 0;

    for (const uid of userIds) {
      const userEntries = byUser.get(uid) || [];
      const updates: ChapterUpdate[] = [];
      const errors: { title: string; message: string }[] = [];

      for (const entry of userEntries) {
        try {
          const latest = await scrapeTrackerUrl((entry as any).tracker_url as string);
          totalChecked++;

          if (latest !== null && latest > (entry.progress_current as number)) {
            updates.push({
              title: entry.title as string,
              latest,
              current: entry.progress_current as number,
              tracker_url: (entry as any).tracker_url as string,
            });
          }
        } catch (err: any) {
          errors.push({
            title: entry.title as string,
            message: err.message,
          });
        }

        // Rate limit between requests
        await sleep(300);
      }

      if (updates.length > 0) {
        updatesByUser.set(uid, updates);
      }
      if (errors.length > 0) {
        errorsByUser.set(uid, errors);
      }
    }

    // ── Send per-user notifications ──────────────────────────────

    let usersNotified = 0;
    let failures = 0;
    const globalFallbackUpdates: { username: string; updates: ChapterUpdate[]; errors: { title: string; message: string }[] }[] = [];

    for (const uid of new Set([...updatesByUser.keys(), ...errorsByUser.keys()])) {
      const updates = updatesByUser.get(uid) || [];
      const errors = errorsByUser.get(uid) || [];
      const user = userMap.get(uid) as any;
      const username = user?.username || "Unknown";

      // Build message lines
      const lines = updates.map(({ title, latest, current, tracker_url }) => {
        const unread = Math.floor(latest - current);
        const unreadStr = unread > 0 ? ` (+${unread})` : "";
        return `➤ <a href="${escapeHtml(tracker_url)}">${escapeHtml(title)}</a>\nChapter ${latest}${unreadStr}`;
      });

      const messageParts = [
        `━━━━ 🔔 <b>${escapeHtml(username)} Updates</b> ━━━━`,
      ];

      if (updates.length > 0) {
        messageParts.push(``);
        messageParts.push(lines.join("\n\n"));
      }

      if (errors.length > 0) {
        messageParts.push(``);
        messageParts.push(`⚠️ <b>Tracker Errors:</b>`);
        errors.forEach(e => {
          messageParts.push(`• <i>${escapeHtml(e.title)}</i>: ${e.message}`);
        });
      }

      messageParts.push(``);
      messageParts.push(`━━ <i>✨ Total: ${updates.length} update${updates.length !== 1 ? "s" : ""}</i> ━━`);

      const message = messageParts.join("\n");

      // Per-user notification if enabled
      if (user?.notifications_enabled && user?.telegram_chat_id) {
        const ok = await sendTelegramToChat(user.telegram_chat_id, message);
        if (ok) {
          usersNotified++;
        } else {
          failures++;
        }
      } else {
        // Queue for global fallback
        globalFallbackUpdates.push({ username, updates, errors });
      }
    }

    // ── Global fallback notification ─────────────────────────────

    if (globalFallbackUpdates.length > 0) {
      const allLines: string[] = [];
      let totalUpdates = 0;

      for (const { username, updates, errors } of globalFallbackUpdates) {
        allLines.push(`👤 <b>${escapeHtml(username)}</b>\n`);
        
        if (updates.length > 0) {
          totalUpdates += updates.length;
          const userLines = updates.map(({ title, latest, current, tracker_url }) => {
            const unread = Math.floor(latest - current);
            const unreadStr = unread > 0 ? ` (+${unread})` : "";
            return `➤ <a href="${escapeHtml(tracker_url)}">${escapeHtml(title)}</a>\nChapter ${latest}${unreadStr}`;
          });
          allLines.push(userLines.join("\n\n"));
        }

        if (errors.length > 0) {
          allLines.push( updates.length > 0 ? `\n⚠️ <i>Errors:</i>` : `⚠️ <i>Errors:</i>` );
          errors.forEach(e => {
            allLines.push(`• <i>${escapeHtml(e.title)}</i>: ${e.message}`);
          });
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
    logInternalError("cron_check_chapters", err, { route: "cron/checkChapters" });
    return jsonError(res, "CRON_ERROR", "Internal server error", 500);
  }
}
