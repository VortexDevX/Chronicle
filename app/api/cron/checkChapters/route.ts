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
import { runBoundedQueue } from "@/lib/services/cron/boundedQueue";
import {
  getNotificationBaseline,
  shouldNotifyProgress,
} from "@/lib/services/cron/notificationState";
import {
  getErrorMessage,
  isTransientScrapeError,
  MediaTypeSupported,
  scrapeTrackerUrl,
} from "@/lib/trackerScraper";

const MAX_USERS = 50;
const MAX_ENTRIES_PER_RUN = 200;
const DEFAULT_CRON_CONCURRENCY = 4;
const MAX_CRON_CONCURRENCY = 8;
const TELEGRAM_MESSAGE_LIMIT = 4000;

const HOST_COOLDOWN_MS = 10 * 60 * 1000;
const hostCooldownUntil = new Map<string, number>();

// ══════════════════════════════════════════════════════════════════
//  SHARED TYPES
// ══════════════════════════════════════════════════════════════════

type ChapterUpdate = {
  media_id: string;
  title: string;
  latest: number;
  current: number;
  tracker_url: string;
  media_type: MediaTypeSupported;
};

function progressUnit(mediaType: MediaTypeSupported): string {
  return mediaType === "Donghua" ? "Episode" : "Chapter";
}

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function getCronConcurrency(): number {
  const raw = Number(process.env.CRON_CHECK_CONCURRENCY || "");
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CRON_CONCURRENCY;
  return Math.min(MAX_CRON_CONCURRENCY, Math.floor(raw));
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
      .select(
        "title progress_current tracker_url user_id media_type last_checked_at latest_remote_progress last_notified_progress",
      )
      .sort({ last_checked_at: 1, _id: 1 })
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
    const selectedEntries = entries.filter((entry) =>
      userIds.includes(String(entry.user_id)),
    );

    await runBoundedQueue(
      selectedEntries,
      getCronConcurrency(),
      async (entry) => {
        const uid = String(entry.user_id);
        const mediaType = entry.media_type as MediaTypeSupported;
        const trackerUrl = String(entry.tracker_url || "");
        const current = Number(entry.progress_current || 0);
        const notificationBaseline = getNotificationBaseline({
          progressCurrent: current,
          latestRemoteProgress: entry.latest_remote_progress as number | null,
          lastNotifiedProgress: entry.last_notified_progress as number | null,
        });
        const host = getHostFromUrl(trackerUrl);
        const cooldownUntil = host ? hostCooldownUntil.get(host) || 0 : 0;

        try {
          if (cooldownUntil > Date.now()) {
            throw new Error(
              `Host cooldown active for ${host} (${Math.ceil((cooldownUntil - Date.now()) / 1000)}s remaining)`,
            );
          }

          const latest = await scrapeTrackerUrl(trackerUrl, mediaType);
          totalChecked += 1;

          await MediaItem.updateOne(
            { _id: entry._id },
            {
              $set: {
                last_checked_at: new Date(),
                last_scrape_status: "ok",
                last_scrape_error: null,
                latest_remote_progress: latest,
              },
              $max: {
                last_notified_progress: notificationBaseline,
              },
            },
          );

          if (shouldNotifyProgress(latest, notificationBaseline)) {
            const updates = updatesByUser.get(uid) || [];
            updates.push({
              media_id: String(entry._id),
              title: entry.title as string,
              latest,
              current,
              tracker_url: trackerUrl,
              media_type: mediaType,
            });
            updatesByUser.set(uid, updates);
          }
        } catch (err) {
          const message = getErrorMessage(err);
          const transient = isTransientScrapeError(err);
          if (host && !transient) {
            hostCooldownUntil.set(host, Date.now() + HOST_COOLDOWN_MS);
          }
          await MediaItem.updateOne(
            { _id: entry._id },
            {
              $set: {
                last_checked_at: new Date(),
                last_scrape_status: "error",
                last_scrape_error: message.slice(0, 500),
              },
            },
          );
          if (!transient) {
            const errors = errorsByUser.get(uid) || [];
            errors.push({
              title: entry.title as string,
              message,
            });
            errorsByUser.set(uid, errors);
          }
        }
      },
    );

    let usersNotified = 0;
    let failures = 0;
    const globalFallbackUpdates: {
      username: string;
      updates: ChapterUpdate[];
      errors: { title: string; message: string }[];
    }[] = [];

    for (const uid of updatesByUser.keys()) {
      const updates = updatesByUser.get(uid) || [];
      const errors = errorsByUser.get(uid) || [];
      const user = userMap.get(uid);
      const username = user?.username || "Unknown";
      const notificationsEnabled = !!user?.notifications_enabled;
      const hasPersonalChat = !!user?.telegram_chat_id;

      if (!notificationsEnabled) {
        continue;
      }

      if (hasPersonalChat) {
        const sentUpdates = takeUserUpdatesThatFit(username, updates);
        const messageWithErrors = buildNotificationMessage(
          username,
          sentUpdates,
          errors,
        );
        const sentMessage =
          messageWithErrors.length <= TELEGRAM_MESSAGE_LIMIT
            ? messageWithErrors
            : buildNotificationMessage(username, sentUpdates, []);
        const ok = await sendTelegramToChat(
          user.telegram_chat_id as string,
          sentMessage,
        );
        if (ok) {
          await markUpdatesNotified(sentUpdates);
          usersNotified++;
        } else {
          failures++;
        }
      } else {
        globalFallbackUpdates.push({ username, updates, errors });
      }
    }

    if (globalFallbackUpdates.length > 0) {
      const sentGroups = takeGlobalUpdatesThatFit(globalFallbackUpdates);
      const messageWithErrors = buildGlobalNotificationMessage(sentGroups);
      const globalMessage =
        messageWithErrors.length <= TELEGRAM_MESSAGE_LIMIT
          ? messageWithErrors
          : buildGlobalNotificationMessage(
              sentGroups.map((group) => ({ ...group, errors: [] })),
            );

      const ok = await sendTelegram(globalMessage);
      if (ok) {
        await markUpdatesNotified(
          sentGroups.flatMap(({ updates }) => updates),
        );
        usersNotified += sentGroups.length;
      } else {
        failures += sentGroups.length;
      }
    }

    const payload = {
      checked: totalChecked,
      scanned: selectedEntries.length,
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
      scanned: payload.scanned,
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

async function markUpdatesNotified(updates: ChapterUpdate[]): Promise<void> {
  if (updates.length === 0) return;

  await MediaItem.bulkWrite(
    updates.map((update) => ({
      updateOne: {
        filter: { _id: update.media_id },
        update: { $max: { last_notified_progress: update.latest } },
      },
    })),
  );
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

function takeUserUpdatesThatFit(
  username: string,
  updates: ChapterUpdate[],
): ChapterUpdate[] {
  const included: ChapterUpdate[] = [];

  for (const update of updates) {
    const candidate = [...included, update];
    if (
      buildNotificationMessage(username, candidate, []).length >
      TELEGRAM_MESSAGE_LIMIT
    ) {
      break;
    }
    included.push(update);
  }

  return included;
}

function buildGlobalNotificationMessage(
  groups: {
    username: string;
    updates: ChapterUpdate[];
    errors: { title: string; message: string }[];
  }[],
): string {
  const allLines: string[] = [];
  let totalUpdates = 0;

  for (const { username, updates, errors } of groups) {
    totalUpdates += updates.length;
    allLines.push(`👤 <b>${escapeHtml(username)}</b>`);

    const manhwa = updates.filter((u) => u.media_type === "Manhwa");
    const donghua = updates.filter((u) => u.media_type === "Donghua");
    const sections = [
      formatMediaSection("Manhwa", "📖", manhwa),
      formatMediaSection("Donghua", "🎬", donghua),
      formatErrorSection(errors),
    ].filter((value): value is string => Boolean(value));

    if (sections.length > 0) allLines.push(sections.join("\n\n"));
    allLines.push("");
  }

  return [
    `━━━━ 🔔 <b>Chronicle Global Updates</b> ━━━━`,
    ``,
    ...allLines,
    `━━ <i>✨ Total: ${totalUpdates} update${totalUpdates !== 1 ? "s" : ""}</i> ━━`,
  ].join("\n");
}

function takeGlobalUpdatesThatFit(
  groups: {
    username: string;
    updates: ChapterUpdate[];
    errors: { title: string; message: string }[];
  }[],
) {
  let included: typeof groups = [];

  for (const group of groups) {
    for (const update of group.updates) {
      const groupIndex = included.findIndex(
        (candidate) => candidate.username === group.username,
      );
      const candidate = included.map((item) => ({
        ...item,
        updates: [...item.updates],
      }));

      if (groupIndex === -1) {
        candidate.push({ ...group, updates: [update] });
      } else {
        candidate[groupIndex].updates.push(update);
      }

      const withoutErrors = candidate.map((item) => ({ ...item, errors: [] }));
      if (
        buildGlobalNotificationMessage(withoutErrors).length >
        TELEGRAM_MESSAGE_LIMIT
      ) {
        return included;
      }
      included = candidate;
    }
  }

  return included;
}
