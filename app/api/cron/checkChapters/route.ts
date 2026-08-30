import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import {
  CronHistory,
  CRON_HISTORY_RETENTION_SECONDS,
  MediaItem,
  PushDevice,
  User,
} from "@/lib/models";
import { sendTelegram, sendTelegramToChat, escapeHtml } from "@/lib/notify";
import { isAndroidPushConfigured, sendAndroidPush } from "@/lib/push";
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
import { fetchAnimeCountdownSchedule } from "@/lib/sources/animeCountdown";

export const maxDuration = 60;

const MAX_USERS = 50;
const MAX_ENTRIES_PER_RUN = 200;
const DEFAULT_CRON_CONCURRENCY = 4;
const MAX_CRON_CONCURRENCY = 8;
const DEFAULT_CRON_TIME_BUDGET_MS = 24_000;
const MIN_CRON_TIME_BUDGET_MS = 10_000;
const MAX_CRON_TIME_BUDGET_MS = 25_000;
const NOTIFICATION_RESERVE_MS = 8_000;
const DEFAULT_CRON_SCRAPE_RETRIES = 2;
const MAX_CRON_SCRAPE_RETRIES = 2;
const CRON_DB_QUERY_TIMEOUT_MS = 5_000;
const SCHEDULE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TELEGRAM_MESSAGE_LIMIT = 4000;

const HOST_COOLDOWN_MS = 10 * 60 * 1000;
const hostCooldownUntil = new Map<string, number>();

// ══════════════════════════════════════════════════════════════════
//  SHARED TYPES
// ══════════════════════════════════════════════════════════════════

type CronMediaType = MediaTypeSupported | "Anime";

type ChapterUpdate = {
  media_id: string;
  title: string;
  latest: number;
  current: number;
  tracker_url: string;
  media_type: CronMediaType;
};

type DeliveryState =
  | "not_needed"
  | "disabled"
  | "unavailable"
  | "sent"
  | "partial"
  | "failed"
  | "deferred";

type UserScanStats = {
  selected: number;
  started: number;
  checked: number;
  scanned: number;
  trackerFailures: number;
  deadlineDeferred: number;
};

type TelegramGroup = {
  uid: string;
  username: string;
  updates: ChapterUpdate[];
  errors: { title: string; message: string }[];
};

function progressUnit(mediaType: CronMediaType): string {
  return mediaType === "Manhwa" ? "Chapter" : "Episode";
}

function isScheduleSyncDue(entry: { schedule_source_url?: string | null; next_episode_release_at?: Date | string | null; last_checked_at?: Date | string | null }): boolean {
  if (!entry.schedule_source_url) return true;
  const releaseAt = entry.next_episode_release_at ? new Date(entry.next_episode_release_at).getTime() : NaN;
  const lastCheckedAt = entry.last_checked_at ? new Date(entry.last_checked_at).getTime() : NaN;
  return !Number.isFinite(releaseAt) || releaseAt <= Date.now() || !Number.isFinite(lastCheckedAt) || Date.now() - lastCheckedAt >= SCHEDULE_REFRESH_INTERVAL_MS;
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

function getCronTimeBudgetMs(): number {
  const raw = Number(process.env.CRON_TIME_BUDGET_MS || "");
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CRON_TIME_BUDGET_MS;
  return Math.min(
    MAX_CRON_TIME_BUDGET_MS,
    Math.max(MIN_CRON_TIME_BUDGET_MS, Math.floor(raw)),
  );
}

function getCronScrapeRetries(): number {
  const raw = Number(process.env.CRON_SCRAPE_RETRIES || "");
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_CRON_SCRAPE_RETRIES;
  return Math.min(MAX_CRON_SCRAPE_RETRIES, Math.floor(raw));
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

  const runStartedAt = Date.now();
  const timeBudgetMs = getCronTimeBudgetMs();
  const scanBudgetMs = Math.max(1_000, timeBudgetMs - NOTIFICATION_RESERVE_MS);
  const requestDeadline = new AbortController();
  const scanDeadline = new AbortController();
  const requestTimer = setTimeout(() => {
    requestDeadline.abort();
    scanDeadline.abort();
  }, timeBudgetMs);
  const scanTimer = setTimeout(() => scanDeadline.abort(), scanBudgetMs);

  try {
    logInfo("cron_check_chapters_start", {
      at: new Date().toISOString(),
      user_agent: req.headers.get("user-agent") || "",
      request_id: req.headers.get("x-vercel-id") || "",
      time_budget_ms: timeBudgetMs,
      scan_budget_ms: scanBudgetMs,
    });

    await connectDB();

    let entries = await MediaItem.find({
      status: "Active",
      $or: [
        { media_type: "Manhwa", tracker_url: { $exists: true, $nin: [null, ""] } },
        { media_type: "Donghua", tracker_url: { $exists: true, $nin: [null, ""] } },
        { media_type: { $in: ["Anime", "Donghua"] }, schedule_source_url: { $exists: true, $nin: [null, ""] } },
      ],
    })
      .select(
        "title progress_current tracker_url schedule_source_url next_episode next_episode_release_at previous_episode previous_episode_release_at release_platform user_id media_type last_attempted_at last_checked_at latest_remote_progress last_notified_progress last_push_notified_progress",
      )
      .sort({ last_attempted_at: 1, last_checked_at: 1, _id: 1 })
      .limit(MAX_ENTRIES_PER_RUN)
      .maxTimeMS(CRON_DB_QUERY_TIMEOUT_MS)
      .lean();

    entries = entries.filter((entry) => isScheduleSyncDue(entry as {
      schedule_source_url?: string | null;
      next_episode_release_at?: Date | string | null;
      last_checked_at?: Date | string | null;
    }));

    if (entries.length === 0) {
      return jsonOk({
        checked: 0,
        selected: 0,
        started: 0,
        scanned: 0,
        deferred: 0,
        deadline_deferred: 0,
        partial: false,
        users_scanned: 0,
        users_notified: 0,
        push_users_notified: 0,
        notifications_deferred: 0,
        push_notifications_deferred: 0,
        failures: 0,
        push_failures: 0,
        time_budget_ms: timeBudgetMs,
        duration_ms: Date.now() - runStartedAt,
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
      .select(
        "_id username notifications_enabled push_notifications_enabled telegram_chat_id",
      )
      .maxTimeMS(CRON_DB_QUERY_TIMEOUT_MS)
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const pushTokensByUser = new Map<string, string[]>();
    if (isAndroidPushConfigured()) {
      const devices = await PushDevice.find({
        user_id: { $in: userIds },
        platform: "android",
      })
        .select("user_id token")
        .limit(MAX_USERS * 20)
        .maxTimeMS(CRON_DB_QUERY_TIMEOUT_MS)
        .lean();
      for (const device of devices) {
        const uid = String(device.user_id);
        const tokens = pushTokensByUser.get(uid) || [];
        tokens.push(String(device.token));
        pushTokensByUser.set(uid, tokens);
      }
    }

    const updatesByUser = new Map<string, ChapterUpdate[]>();
    const pushUpdatesByUser = new Map<string, ChapterUpdate[]>();
    const foundUpdatesByUser = new Map<string, ChapterUpdate[]>();
    const unreadByUser = new Map<string, ChapterUpdate[]>();
    const errorsByUser = new Map<
      string,
      { title: string; message: string }[]
    >();
    const historyErrorsByUser = new Map<
      string,
      { title: string; message: string }[]
    >();
    let totalChecked = 0;
    let totalStarted = 0;
    let totalFinished = 0;
    let deadlineDeferred = 0;
    const selectedEntries = entries.filter((entry) =>
      userIds.includes(String(entry.user_id)),
    );
    const scanStatsByUser = new Map<string, UserScanStats>();
    const telegramDeliveryByUser = new Map<string, DeliveryState>();
    const pushDeliveryByUser = new Map<string, DeliveryState>();
    for (const uid of userIds) {
      const selected = selectedEntries.filter(
        (entry) => String(entry.user_id) === uid,
      ).length;
      scanStatsByUser.set(uid, {
        selected,
        started: 0,
        checked: 0,
        scanned: 0,
        trackerFailures: 0,
        deadlineDeferred: 0,
      });
      telegramDeliveryByUser.set(uid, "not_needed");
      pushDeliveryByUser.set(uid, "not_needed");
    }

    await runBoundedQueue(
      selectedEntries,
      getCronConcurrency(),
      async (entry) => {
        totalStarted += 1;
        const uid = String(entry.user_id);
        const userStats = scanStatsByUser.get(uid);
        if (userStats) userStats.started += 1;
        const mediaType = entry.media_type as CronMediaType;
        const trackerUrl = String(entry.tracker_url || "");
        const scheduleSourceUrl = String(entry.schedule_source_url || "");
        const sourceUrl = scheduleSourceUrl || trackerUrl;
        const current = Number(entry.progress_current || 0);
        const notificationBaseline = getNotificationBaseline({
          progressCurrent: current,
          latestRemoteProgress: entry.latest_remote_progress as number | null,
          lastNotifiedProgress: entry.last_notified_progress as number | null,
        });
        const pushNotificationBaseline = getNotificationBaseline({
          progressCurrent: current,
          latestRemoteProgress: entry.latest_remote_progress as number | null,
          lastNotifiedProgress: entry.last_push_notified_progress as
            | number
            | null,
        });
        const storedLatest = Number(entry.latest_remote_progress);
        if (Number.isFinite(storedLatest) && storedLatest > current) {
          setUnreadUpdate(unreadByUser, uid, {
            media_id: String(entry._id),
            title: entry.title as string,
            latest: storedLatest,
            current,
            tracker_url: sourceUrl,
            media_type: mediaType,
          });
        }
        const host = getHostFromUrl(sourceUrl);
        const cooldownUntil = host ? hostCooldownUntil.get(host) || 0 : 0;

        try {
          if (cooldownUntil > Date.now()) {
            throw new Error(
              `Host cooldown active for ${host} (${Math.ceil((cooldownUntil - Date.now()) / 1000)}s remaining)`,
            );
          }

          const schedule = scheduleSourceUrl
            ? await fetchAnimeCountdownSchedule(scheduleSourceUrl, {
                signal: scanDeadline.signal,
                retryAttempts: getCronScrapeRetries(),
              })
            : null;
          const latest = schedule
            ? schedule.episode !== null && schedule.releaseAt !== null && schedule.releaseAt.getTime() <= Date.now()
              ? schedule.episode
              : schedule.previousEpisode
            : await scrapeTrackerUrl(trackerUrl, mediaType as MediaTypeSupported, {
                signal: scanDeadline.signal,
                retryAttempts: getCronScrapeRetries(),
              });
          totalChecked += 1;
          if (userStats) userStats.checked += 1;

          await MediaItem.updateOne(
            { _id: entry._id },
            {
              $set: {
                last_attempted_at: new Date(),
                last_checked_at: new Date(),
                last_scrape_status: "ok",
                last_scrape_error: null,
                ...(latest !== null ? { latest_remote_progress: latest } : {}),
                ...(schedule ? {
                  next_episode: schedule.episode,
                  next_episode_release_at: schedule.releaseAt,
                  previous_episode: schedule.previousEpisode,
                  previous_episode_release_at: schedule.previousReleaseAt,
                  release_platform: schedule.platform,
                } : {}),
              },
              $max: {
                last_notified_progress: notificationBaseline,
                last_push_notified_progress: pushNotificationBaseline,
              },
            },
          );
          totalFinished += 1;
          if (userStats) userStats.scanned += 1;

          if (latest !== null && latest > current) {
            const update: ChapterUpdate = {
              media_id: String(entry._id),
              title: entry.title as string,
              latest,
              current,
              tracker_url: sourceUrl,
              media_type: mediaType,
            };
            setUnreadUpdate(unreadByUser, uid, update);
            setUnreadUpdate(foundUpdatesByUser, uid, update);

            if (shouldNotifyProgress(latest, notificationBaseline)) {
              const updates = updatesByUser.get(uid) || [];
              updates.push(update);
              updatesByUser.set(uid, updates);
            }
            if (shouldNotifyProgress(latest, pushNotificationBaseline)) {
              const pushUpdates = pushUpdatesByUser.get(uid) || [];
              pushUpdates.push(update);
              pushUpdatesByUser.set(uid, pushUpdates);
            }
          }
        } catch (err) {
          if (scanDeadline.signal.aborted) {
            deadlineDeferred += 1;
            if (userStats) userStats.deadlineDeferred += 1;
            await MediaItem.updateOne(
              { _id: entry._id },
              { $set: { last_attempted_at: new Date() } },
            );
            return;
          }

          const message = getErrorMessage(err);
          const transient = isTransientScrapeError(err);
          const historyErrors = historyErrorsByUser.get(uid) || [];
          historyErrors.push({ title: entry.title as string, message });
          historyErrorsByUser.set(uid, historyErrors);
          if (host && !transient) {
            hostCooldownUntil.set(host, Date.now() + HOST_COOLDOWN_MS);
          }
          await MediaItem.updateOne(
            { _id: entry._id },
            {
              $set: {
                last_attempted_at: new Date(),
                last_checked_at: new Date(),
                last_scrape_status: "error",
                last_scrape_error: message.slice(0, 500),
              },
            },
          );
          totalFinished += 1;
          if (userStats) {
            userStats.scanned += 1;
            userStats.trackerFailures += 1;
          }
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
      { signal: scanDeadline.signal },
    );

    const deferredEntries = Math.max(
      0,
      selectedEntries.length - totalFinished,
    );

    let pushUsersNotified = 0;
    let pushFailures = 0;
    let pushNotificationsDeferred = 0;
    let pushDevicesInvalidated = 0;

    for (const [uid, updates] of pushUpdatesByUser) {
      const user = userMap.get(uid);
      if (!user?.push_notifications_enabled) {
        pushDeliveryByUser.set(uid, "disabled");
        continue;
      }

      const tokens = pushTokensByUser.get(uid) || [];
      if (tokens.length === 0) {
        pushDeliveryByUser.set(uid, "unavailable");
        continue;
      }

      if (requestDeadline.signal.aborted) {
        pushDeliveryByUser.set(uid, "deferred");
        pushNotificationsDeferred += 1;
        continue;
      }

      const result = await sendAndroidPush(
        tokens,
        buildAndroidPushPayload(updates),
        requestDeadline.signal,
      );
      pushFailures += result.failed;

      if (result.invalidTokens.length > 0) {
        const deletion = await PushDevice.deleteMany({
          token: { $in: result.invalidTokens },
        });
        pushDevicesInvalidated += deletion.deletedCount || 0;
      }

      if (result.sent > 0) {
        await markPushUpdatesNotified(updates);
        pushUsersNotified += 1;
        pushDeliveryByUser.set(uid, result.failed > 0 ? "partial" : "sent");
      } else if (requestDeadline.signal.aborted) {
        pushDeliveryByUser.set(uid, "deferred");
        pushNotificationsDeferred += 1;
      } else {
        pushDeliveryByUser.set(uid, "failed");
      }
    }

    let usersNotified = 0;
    let failures = 0;
    let notificationsDeferred = 0;
    const globalFallbackUpdates: TelegramGroup[] = [];

    for (const uid of updatesByUser.keys()) {
      const unreadUpdates = unreadByUser.get(uid) || [];
      const errors = errorsByUser.get(uid) || [];
      const user = userMap.get(uid);
      const username = user?.username || "Unknown";
      const notificationsEnabled = !!user?.notifications_enabled;
      const hasPersonalChat = !!user?.telegram_chat_id;

      if (!notificationsEnabled) {
        telegramDeliveryByUser.set(uid, "disabled");
        continue;
      }

      if (requestDeadline.signal.aborted) {
        telegramDeliveryByUser.set(uid, "deferred");
        notificationsDeferred += 1;
        continue;
      }

      if (hasPersonalChat) {
        const sentUpdates = takeUserUpdatesThatFit(unreadUpdates);
        const messageWithErrors = buildNotificationMessage(sentUpdates, errors);
        const sentMessage =
          messageWithErrors.length <= TELEGRAM_MESSAGE_LIMIT
            ? messageWithErrors
            : buildNotificationMessage(sentUpdates, []);
        const ok = await sendTelegramToChat(
          user.telegram_chat_id as string,
          sentMessage,
          requestDeadline.signal,
        );
        if (ok) {
          await markUpdatesNotified(sentUpdates);
          telegramDeliveryByUser.set(uid, "sent");
          usersNotified++;
        } else if (requestDeadline.signal.aborted) {
          telegramDeliveryByUser.set(uid, "deferred");
          notificationsDeferred += 1;
        } else {
          telegramDeliveryByUser.set(uid, "failed");
          failures++;
        }
      } else {
        telegramDeliveryByUser.set(uid, "deferred");
        globalFallbackUpdates.push({
          uid,
          username,
          updates: unreadUpdates,
          errors,
        });
      }
    }

    if (
      globalFallbackUpdates.length > 0 &&
      !requestDeadline.signal.aborted
    ) {
      const sentGroups = takeGlobalUpdatesThatFit(globalFallbackUpdates);
      const messageWithErrors = buildGlobalNotificationMessage(sentGroups);
      const globalMessage =
        messageWithErrors.length <= TELEGRAM_MESSAGE_LIMIT
          ? messageWithErrors
          : buildGlobalNotificationMessage(
              sentGroups.map((group) => ({ ...group, errors: [] })),
            );

      const ok = await sendTelegram(globalMessage, requestDeadline.signal);
      if (ok) {
        await markUpdatesNotified(sentGroups.flatMap(({ updates }) => updates));
        for (const group of sentGroups) {
          telegramDeliveryByUser.set(group.uid, "sent");
        }
        usersNotified += sentGroups.length;
      } else if (requestDeadline.signal.aborted) {
        for (const group of sentGroups) {
          telegramDeliveryByUser.set(group.uid, "deferred");
        }
        notificationsDeferred += sentGroups.length;
      } else {
        for (const group of sentGroups) {
          telegramDeliveryByUser.set(group.uid, "failed");
        }
        failures += sentGroups.length;
      }
    } else if (globalFallbackUpdates.length > 0) {
      for (const group of globalFallbackUpdates) {
        telegramDeliveryByUser.set(group.uid, "deferred");
      }
      notificationsDeferred += globalFallbackUpdates.length;
    }

    const payload = {
      checked: totalChecked,
      selected: selectedEntries.length,
      started: totalStarted,
      scanned: totalFinished,
      deferred: deferredEntries,
      deadline_deferred: deadlineDeferred,
      partial:
        deferredEntries > 0 ||
        notificationsDeferred > 0 ||
        pushNotificationsDeferred > 0,
      users_scanned: userIds.length,
      users_notified: usersNotified,
      push_users_notified: pushUsersNotified,
      notifications_deferred: notificationsDeferred,
      push_notifications_deferred: pushNotificationsDeferred,
      failures,
      push_failures: pushFailures,
      push_devices_invalidated: pushDevicesInvalidated,
      time_budget_ms: timeBudgetMs,
      duration_ms: Date.now() - runStartedAt,
      updates_by_user: Object.fromEntries(
        Array.from(updatesByUser.entries()).map(([uid, updates]) => {
          const user = userMap.get(uid);
          return [user?.username || uid, updates];
        }),
      ),
    };

    await saveCronHistory({
      userIds,
      runStartedAt,
      durationMs: payload.duration_ms,
      scanStatsByUser,
      foundUpdatesByUser,
      errorsByUser: historyErrorsByUser,
      telegramDeliveryByUser,
      pushDeliveryByUser,
    });

    logInfo("cron_check_chapters_complete", {
      at: new Date().toISOString(),
      checked: payload.checked,
      selected: payload.selected,
      started: payload.started,
      scanned: payload.scanned,
      deferred: payload.deferred,
      partial: payload.partial,
      users_scanned: payload.users_scanned,
      users_notified: payload.users_notified,
      push_users_notified: payload.push_users_notified,
      notifications_deferred: payload.notifications_deferred,
      push_notifications_deferred: payload.push_notifications_deferred,
      failures: payload.failures,
      push_failures: payload.push_failures,
      duration_ms: payload.duration_ms,
    });

    return jsonOk(payload);
  } catch (err) {
    logInternalError("cron_check_chapters", err, {
      route: "cron/checkChapters",
    });
    return jsonError("CRON_ERROR", "Internal server error", 500);
  } finally {
    clearTimeout(scanTimer);
    clearTimeout(requestTimer);
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

async function markPushUpdatesNotified(
  updates: ChapterUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  await MediaItem.bulkWrite(
    updates.map((update) => ({
      updateOne: {
        filter: { _id: update.media_id },
        update: { $max: { last_push_notified_progress: update.latest } },
      },
    })),
  );
}

function setUnreadUpdate(
  unreadByUser: Map<string, ChapterUpdate[]>,
  uid: string,
  update: ChapterUpdate,
): void {
  const unread = unreadByUser.get(uid) || [];
  const existingIndex = unread.findIndex(
    (candidate) => candidate.media_id === update.media_id,
  );

  if (existingIndex === -1) unread.push(update);
  else unread[existingIndex] = update;

  unreadByUser.set(uid, unread);
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATION HELPERS
// ══════════════════════════════════════════════════════════════════

function formatUpdateItem(update: ChapterUpdate): string {
  const unread = Math.max(
    0,
    Math.round((update.latest - update.current) * 1000) / 1000,
  );
  const unreadStr = unread > 0 ? ` (+${unread})` : "";
  const unit = progressUnit(update.media_type);

  return `• <a href="${escapeHtml(update.tracker_url)}">${escapeHtml(update.title)}</a> — ${unit} ${update.current}${unreadStr}`;
}

function buildAndroidPushPayload(updates: ChapterUpdate[]) {
  const first = updates[0];
  if (updates.length === 1 && first) {
    const unit = progressUnit(first.media_type);
    const unread = Math.max(
      0,
      Math.round((first.latest - first.current) * 1000) / 1000,
    );
    return {
      title: "Chronicle Update",
      body: `${first.title} — ${unit} ${first.latest} is available${unread > 0 ? ` (+${unread})` : ""}`,
      path: "/updates",
    };
  }

  const titles = updates
    .slice(0, 2)
    .map((update) => update.title)
    .join(", ");
  const extra = Math.max(0, updates.length - 2);
  return {
    title: `${updates.length} Chronicle updates`,
    body: `${titles}${extra > 0 ? ` and ${extra} more` : ""}`,
    path: "/updates",
  };
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
  updates: ChapterUpdate[],
  errors: { title: string; message: string }[],
): string {
  const manhwa = updates.filter((u) => u.media_type === "Manhwa");
  const donghua = updates.filter((u) => u.media_type === "Donghua");

  const parts = [
    `━━━━ 🔔 <b>Chronicle Update</b> ━━━━`,
    formatMediaSection("Manhwa", "📖", manhwa),
    formatMediaSection("Donghua", "🎬", donghua),
    formatErrorSection(errors),
    `━━ <i>✨ Total: ${updates.length} update${updates.length !== 1 ? "s" : ""}</i> ━━`,
  ].filter((v): v is string => Boolean(v));

  return parts.join("\n\n");
}

function takeUserUpdatesThatFit(updates: ChapterUpdate[]): ChapterUpdate[] {
  const included: ChapterUpdate[] = [];

  for (const update of updates) {
    const candidate = [...included, update];
    if (
      buildNotificationMessage(candidate, []).length >
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
    `━━━━ 🔔 <b>Chronicle Update</b> ━━━━`,
    ``,
    ...allLines,
    `━━ <i>✨ Total: ${totalUpdates} update${totalUpdates !== 1 ? "s" : ""}</i> ━━`,
  ].join("\n");
}

function takeGlobalUpdatesThatFit(
  groups: TelegramGroup[],
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

async function saveCronHistory({
  userIds,
  runStartedAt,
  durationMs,
  scanStatsByUser,
  foundUpdatesByUser,
  errorsByUser,
  telegramDeliveryByUser,
  pushDeliveryByUser,
}: {
  userIds: string[];
  runStartedAt: number;
  durationMs: number;
  scanStatsByUser: Map<string, UserScanStats>;
  foundUpdatesByUser: Map<string, ChapterUpdate[]>;
  errorsByUser: Map<string, { title: string; message: string }[]>;
  telegramDeliveryByUser: Map<string, DeliveryState>;
  pushDeliveryByUser: Map<string, DeliveryState>;
}): Promise<void> {
  const completedAt = new Date();
  const issueStates = new Set<DeliveryState>([
    "unavailable",
    "partial",
    "failed",
    "deferred",
  ]);
  const documents = userIds.flatMap((uid) => {
    const stats = scanStatsByUser.get(uid);
    if (!stats || stats.selected === 0) return [];

    const updates = foundUpdatesByUser.get(uid) || [];
    const errors = errorsByUser.get(uid) || [];
    const telegramDelivery = telegramDeliveryByUser.get(uid) || "not_needed";
    const pushDelivery = pushDeliveryByUser.get(uid) || "not_needed";
    const deferred = Math.max(0, stats.selected - stats.scanned);
    const partial =
      deferred > 0 ||
      stats.trackerFailures > 0 ||
      issueStates.has(telegramDelivery) ||
      issueStates.has(pushDelivery);

    return [{
      user_id: uid,
      started_at: new Date(runStartedAt),
      completed_at: completedAt,
      expires_at: new Date(
        completedAt.getTime() + CRON_HISTORY_RETENTION_SECONDS * 1000,
      ),
      status: partial ? "partial" : "success",
      selected: stats.selected,
      checked: stats.checked,
      updates_found: updates.length,
      tracker_failures: stats.trackerFailures,
      deferred,
      duration_ms: durationMs,
      telegram_delivery: telegramDelivery,
      push_delivery: pushDelivery,
      updates: updates.slice(0, 20).map((update) => ({
        media_id: update.media_id,
        title: update.title.slice(0, 200),
        media_type: update.media_type,
        current: update.current,
        latest: update.latest,
      })),
      tracker_errors: errors.slice(0, 10).map((error) => ({
        title: error.title.slice(0, 200),
        message: error.message.slice(0, 300),
      })),
    }];
  });

  if (documents.length === 0) return;

  try {
    await CronHistory.bulkWrite(
      documents.map((document) => ({ insertOne: { document } })),
      { ordered: false, timeoutMS: 1_500 },
    );
  } catch (err) {
    logInternalError("cron_history_write_error", err, {
      route: "cron/checkChapters",
      users: documents.length,
    });
  }
}
