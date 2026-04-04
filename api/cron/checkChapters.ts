import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, MediaItem, User } from "../_utils/db.js";
import {
  sendTelegram,
  sendTelegramToChat,
  escapeHtml,
} from "../_utils/notify.js";
import { jsonOk, jsonError } from "../_utils/http.js";
import { logInternalError } from "../_utils/log.js";

/**
 * Vercel Cron — runs daily at 9AM UTC
 * Schedule set in vercel.json: "0 9 * * *"
 *
 * For each Manhwa entry that:
 *   - has status "Watching/Reading"
 *   - has a source_id (MangaDex UUID)
 *
 * Checks MangaDex for the latest English chapter.
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

// MangaDex chapter fetch — returns latest English chapter number or null
async function fetchLatestChapter(mangaId: string): Promise<number | null> {
  try {
    const url = new URL("https://api.mangadex.org/chapter");
    url.searchParams.set("manga", mangaId);
    url.searchParams.set("translatedLanguage[]", "en");
    url.searchParams.set("order[publishAt]", "desc");
    url.searchParams.set("limit", "1");
    url.searchParams.set("contentRating[]", "safe");
    url.searchParams.append("contentRating[]", "suggestive");
    url.searchParams.append("contentRating[]", "erotica");

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const json = await res.json();
    const chapter = json.data?.[0]?.attributes?.chapter;
    if (!chapter) return null;

    const parsed = parseFloat(chapter);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ChapterUpdate = {
  title: string;
  latest: number;
  current: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends Authorization header with CRON_SECRET
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
  }

  try {
    await connectDB();

    // Fetch all Manhwa entries that are actively being read and have a MangaDex source_id
    const entries = await MediaItem.find({
      media_type: "Manhwa",
      status: "Watching/Reading",
      source_id: { $exists: true, $ne: null },
    })
      .select("title progress_current source_id user_id")
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
    let totalChecked = 0;

    for (const uid of userIds) {
      const userEntries = byUser.get(uid) || [];
      const updates: ChapterUpdate[] = [];

      for (const entry of userEntries) {
        const latest = await fetchLatestChapter(entry.source_id as string);
        totalChecked++;

        if (latest !== null && latest > (entry.progress_current as number)) {
          updates.push({
            title: entry.title as string,
            latest,
            current: entry.progress_current as number,
          });
        }

        // Respect MangaDex rate limit
        await sleep(300);
      }

      if (updates.length > 0) {
        updatesByUser.set(uid, updates);
      }
    }

    // ── Send per-user notifications ──────────────────────────────

    let usersNotified = 0;
    let failures = 0;
    const globalFallbackUpdates: { username: string; updates: ChapterUpdate[] }[] = [];

    for (const [uid, updates] of updatesByUser) {
      const user = userMap.get(uid) as any;
      const username = user?.username || "Unknown";

      // Build message lines
      const lines = updates.map(({ title, latest, current }) => {
        const unread = Math.floor(latest - current);
        const unreadStr = unread > 0 ? ` (+${unread} unread)` : "";
        return `📖 <b>${escapeHtml(title)}</b> — Ch. ${latest}${unreadStr}`;
      });

      const message = [
        `<b>📚 Chronicle — New Chapters for ${escapeHtml(username)}</b>`,
        ``,
        ...lines,
        ``,
        `<i>${updates.length} update${updates.length !== 1 ? "s" : ""} found</i>`,
      ].join("\n");

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
        globalFallbackUpdates.push({ username, updates });
      }
    }

    // ── Global fallback notification ─────────────────────────────

    if (globalFallbackUpdates.length > 0) {
      const allLines: string[] = [];
      for (const { username, updates } of globalFallbackUpdates) {
        allLines.push(`<b>— ${escapeHtml(username)} —</b>`);
        for (const { title, latest, current } of updates) {
          const unread = Math.floor(latest - current);
          const unreadStr = unread > 0 ? ` (+${unread} unread)` : "";
          allLines.push(
            `📖 <b>${escapeHtml(title)}</b> — Ch. ${latest}${unreadStr}`,
          );
        }
        allLines.push("");
      }

      const totalUpdates = globalFallbackUpdates.reduce(
        (sum, g) => sum + g.updates.length,
        0,
      );

      const globalMessage = [
        `<b>📚 Chronicle — New Chapters Available</b>`,
        ``,
        ...allLines,
        `<i>${totalUpdates} update${totalUpdates !== 1 ? "s" : ""} across ${globalFallbackUpdates.length} user${globalFallbackUpdates.length !== 1 ? "s" : ""}</i>`,
      ].join("\n");

      const ok = await sendTelegram(globalMessage);
      if (ok) usersNotified += globalFallbackUpdates.length;
      else failures += globalFallbackUpdates.length;
    }

    return jsonOk(res, {
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
    });
  } catch (err) {
    logInternalError("cron_check_chapters", err, { route: "cron/checkChapters" });
    return jsonError(res, "CRON_ERROR", "Internal server error", 500);
  }
}
