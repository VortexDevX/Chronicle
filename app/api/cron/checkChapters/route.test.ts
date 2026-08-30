import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  mediaFind: vi.fn(),
  mediaUpdateOne: vi.fn(),
  mediaBulkWrite: vi.fn(),
  userFind: vi.fn(),
  pushDeviceFind: vi.fn(),
  pushDeviceDeleteMany: vi.fn(),
  cronHistoryBulkWrite: vi.fn(),
  scrapeTrackerUrl: vi.fn(),
  fetchAnimeCountdownSchedule: vi.fn(),
  sendTelegram: vi.fn(),
  sendTelegramToChat: vi.fn(),
  isAndroidPushConfigured: vi.fn(),
  sendAndroidPush: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/models", () => ({
  MediaItem: {
    find: mocks.mediaFind,
    updateOne: mocks.mediaUpdateOne,
    bulkWrite: mocks.mediaBulkWrite,
  },
  User: { find: mocks.userFind },
  PushDevice: {
    find: mocks.pushDeviceFind,
    deleteMany: mocks.pushDeviceDeleteMany,
  },
  CronHistory: { bulkWrite: mocks.cronHistoryBulkWrite },
  CRON_HISTORY_RETENTION_SECONDS: 30 * 24 * 60 * 60,
}));
vi.mock("@/lib/notify", () => ({
  escapeHtml: (text: string) => text,
  sendTelegram: mocks.sendTelegram,
  sendTelegramToChat: mocks.sendTelegramToChat,
}));
vi.mock("@/lib/push", () => ({
  isAndroidPushConfigured: mocks.isAndroidPushConfigured,
  sendAndroidPush: mocks.sendAndroidPush,
}));
vi.mock("@/lib/trackerScraper", () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
  isTransientScrapeError: () => false,
  scrapeTrackerUrl: mocks.scrapeTrackerUrl,
}));
vi.mock("@/lib/sources/animeCountdown", () => ({ fetchAnimeCountdownSchedule: mocks.fetchAnimeCountdownSchedule }));
vi.mock("@/lib/log", () => ({
  logInfo: vi.fn(),
  logInternalError: vi.fn(),
}));

import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const originalCronTimeBudget = process.env.CRON_TIME_BUDGET_MS;
const originalCronConcurrency = process.env.CRON_CHECK_CONCURRENCY;

type Entry = {
  _id: string;
  user_id: string;
  title: string;
  media_type: "Anime" | "Manhwa" | "Donghua";
  progress_current: number;
  tracker_url: string;
  schedule_source_url?: string | null;
  next_episode_release_at?: Date | null;
  latest_remote_progress?: number | null;
  last_notified_progress?: number | null;
  last_push_notified_progress?: number | null;
};

type User = {
  _id: string;
  username: string;
  notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  telegram_chat_id: string | null;
};

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function mockFindResults(
  entries: Entry[],
  users: User[],
  devices: { user_id: string; token: string }[] = [],
) {
  const mediaQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  mediaQuery.select = vi.fn(() => mediaQuery);
  mediaQuery.sort = vi.fn(() => mediaQuery);
  mediaQuery.limit = vi.fn(() => mediaQuery);
  mediaQuery.maxTimeMS = vi.fn(() => mediaQuery);
  mediaQuery.lean = vi.fn().mockResolvedValue(entries);
  mocks.mediaFind.mockReturnValue(mediaQuery);

  const userQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  userQuery.select = vi.fn(() => userQuery);
  userQuery.maxTimeMS = vi.fn(() => userQuery);
  userQuery.lean = vi.fn().mockResolvedValue(users);
  mocks.userFind.mockReturnValue(userQuery);

  const pushQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  pushQuery.select = vi.fn(() => pushQuery);
  pushQuery.limit = vi.fn(() => pushQuery);
  pushQuery.maxTimeMS = vi.fn(() => pushQuery);
  pushQuery.lean = vi.fn().mockResolvedValue(devices);
  mocks.pushDeviceFind.mockReturnValue(pushQuery);
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    _id: "media-1",
    user_id: "user-1",
    title: "Test Series",
    media_type: "Manhwa",
    progress_current: 111,
    tracker_url: "https://tracker.example/series",
    latest_remote_progress: 112,
    last_notified_progress: 112,
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1",
    username: "Reader",
    notifications_enabled: true,
    push_notifications_enabled: false,
    telegram_chat_id: "personal-chat",
    ...overrides,
  };
}

function authorizedRequest() {
  return new NextRequest("https://chronicle.example/api/cron/checkChapters", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  setNodeEnv("test");
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.mediaUpdateOne.mockResolvedValue({ acknowledged: true });
  mocks.mediaBulkWrite.mockResolvedValue({ acknowledged: true });
  mocks.sendTelegram.mockResolvedValue(true);
  mocks.sendTelegramToChat.mockResolvedValue(true);
  mocks.isAndroidPushConfigured.mockReturnValue(false);
  mocks.sendAndroidPush.mockResolvedValue({
    configured: true,
    sent: 1,
    failed: 0,
    invalidTokens: [],
  });
  mocks.pushDeviceDeleteMany.mockResolvedValue({ deletedCount: 0 });
  mocks.cronHistoryBulkWrite.mockResolvedValue({ acknowledged: true });
});

afterEach(() => {
  process.env.CRON_SECRET = originalCronSecret;
  process.env.CRON_TIME_BUDGET_MS = originalCronTimeBudget;
  process.env.CRON_CHECK_CONCURRENCY = originalCronConcurrency;
  setNodeEnv(originalNodeEnv || "test");
  vi.useRealTimers();
});

describe("cron chapter check auth", () => {
  it("requires CRON_SECRET in production", async () => {
    process.env.CRON_SECRET = "";
    setNodeEnv("production");

    const res = await GET(
      new NextRequest("https://chronicle.example/api/cron/checkChapters"),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("CRON_SECRET_MISSING");
  });

  it("rejects requests with wrong bearer token", async () => {
    setNodeEnv("production");

    const res = await GET(
      new NextRequest("https://chronicle.example/api/cron/checkChapters", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });
});

describe("cron chapter notification state", () => {
  it("syncs Anime Countdown schedules without treating future episodes as released", async () => {
    mockFindResults([makeEntry({ media_type: "Anime", tracker_url: "", schedule_source_url: "https://animecountdown.com/123/example", progress_current: 98, latest_remote_progress: 98 })], [makeUser()]);
    mocks.fetchAnimeCountdownSchedule.mockResolvedValue({
      episode: 99, releaseAt: new Date(Date.now() + 60 * 60 * 1000),
      previousEpisode: 98, previousReleaseAt: new Date(), platform: "Bilibili",
    });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.checked).toBe(1);
    expect(mocks.fetchAnimeCountdownSchedule).toHaveBeenCalledWith("https://animecountdown.com/123/example", expect.any(Object));
    expect(mocks.sendTelegramToChat).not.toHaveBeenCalled();
    expect(mocks.mediaUpdateOne).toHaveBeenCalledWith(
      { _id: "media-1" },
      expect.objectContaining({ $set: expect.objectContaining({ next_episode: 99, release_platform: "Bilibili" }) }),
    );
  });

  it("announces genuine new progress and preserves unread +N", async () => {
    mockFindResults([makeEntry()], [makeUser()]);
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    const res = await GET(authorizedRequest());

    expect(res.status).toBe(200);
    expect(mocks.sendTelegramToChat).toHaveBeenCalledOnce();
    expect(mocks.sendTelegramToChat.mock.calls[0][1]).toContain(
      "Chronicle Update",
    );
    expect(mocks.sendTelegramToChat.mock.calls[0][1]).not.toContain(
      "Reader Updates",
    );
    expect(mocks.sendTelegramToChat.mock.calls[0][1]).toContain(
      "Chapter 111 (+2)",
    );
    expect(mocks.mediaBulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "media-1" },
          update: { $max: { last_notified_progress: 113 } },
        },
      },
    ]);
    expect(mocks.cronHistoryBulkWrite).toHaveBeenCalledWith(
      [
        {
          insertOne: {
            document: expect.objectContaining({
              user_id: "user-1",
              status: "success",
              checked: 1,
              updates_found: 1,
              telegram_delivery: "sent",
              push_delivery: "disabled",
              expires_at: expect.any(Date),
            }),
          },
        },
      ],
      { ordered: false, timeoutMS: 1_500 },
    );
  });

  it("shows fractional unread chapter progress", async () => {
    mockFindResults(
      [
        makeEntry({
          progress_current: 112,
          latest_remote_progress: 112,
          last_notified_progress: 112,
        }),
      ],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(112.6);

    await GET(authorizedRequest());

    const message = mocks.sendTelegramToChat.mock.calls[0][1];
    expect(message).toContain("Chapter 112 (+0.6)");
    expect(mocks.mediaBulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "media-1" },
          update: { $max: { last_notified_progress: 112.6 } },
        },
      },
    ]);
  });

  it("includes previously announced items that remain unread", async () => {
    mockFindResults(
      [
        makeEntry({
          _id: "media-old",
          title: "Already Announced",
          latest_remote_progress: 112,
          last_notified_progress: 112,
        }),
        makeEntry({
          _id: "media-new",
          title: "New Release",
          latest_remote_progress: 112,
          last_notified_progress: 112,
        }),
      ],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl
      .mockResolvedValueOnce(112)
      .mockResolvedValueOnce(113);

    await GET(authorizedRequest());

    const message = mocks.sendTelegramToChat.mock.calls[0][1];
    expect(message).toContain("Already Announced");
    expect(message).toContain("Chapter 111 (+1)");
    expect(message).toContain("New Release");
    expect(message).toContain("Chapter 111 (+2)");
  });

  it("does not announce same release on next run", async () => {
    mockFindResults(
      [makeEntry({ latest_remote_progress: 113, last_notified_progress: 113 })],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    await GET(authorizedRequest());

    expect(mocks.sendTelegramToChat).not.toHaveBeenCalled();
    expect(mocks.mediaBulkWrite).not.toHaveBeenCalled();
  });

  it("advances state without late notification when user got there first", async () => {
    mockFindResults(
      [makeEntry({ latest_remote_progress: 111, last_notified_progress: 110 })],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(111);

    await GET(authorizedRequest());

    expect(mocks.sendTelegramToChat).not.toHaveBeenCalled();
    expect(mocks.mediaUpdateOne).toHaveBeenCalledWith(
      { _id: "media-1" },
      expect.objectContaining({
        $max: expect.objectContaining({ last_notified_progress: 111 }),
      }),
    );
  });

  it("leaves notification state unchanged after Telegram failure", async () => {
    mockFindResults([makeEntry()], [makeUser()]);
    mocks.scrapeTrackerUrl.mockResolvedValue(113);
    mocks.sendTelegramToChat.mockResolvedValue(false);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.data.failures).toBe(1);
    expect(mocks.mediaBulkWrite).not.toHaveBeenCalled();
  });

  it("keeps cron successful when optional history logging fails", async () => {
    mockFindResults([makeEntry()], [makeUser()]);
    mocks.scrapeTrackerUrl.mockResolvedValue(113);
    mocks.cronHistoryBulkWrite.mockRejectedValue(new Error("history unavailable"));

    const response = await GET(authorizedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.checked).toBe(1);
    expect(mocks.sendTelegramToChat).toHaveBeenCalledOnce();
  });

  it("baselines legacy rows without resending stored remote progress", async () => {
    mockFindResults(
      [makeEntry({ latest_remote_progress: 112, last_notified_progress: undefined })],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(112);

    await GET(authorizedRequest());

    expect(mocks.sendTelegramToChat).not.toHaveBeenCalled();
    expect(mocks.mediaUpdateOne).toHaveBeenCalledWith(
      { _id: "media-1" },
      expect.objectContaining({
        $max: expect.objectContaining({ last_notified_progress: 112 }),
      }),
    );
  });

  it("announces progress newer than legacy row stored baseline", async () => {
    mockFindResults(
      [makeEntry({ latest_remote_progress: 112, last_notified_progress: undefined })],
      [makeUser()],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    await GET(authorizedRequest());

    expect(mocks.sendTelegramToChat).toHaveBeenCalledOnce();
    expect(mocks.mediaBulkWrite).toHaveBeenCalledOnce();
  });

  it("marks fallback-chat entries only after global send succeeds", async () => {
    mockFindResults([makeEntry()], [makeUser({ telegram_chat_id: null })]);
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    await GET(authorizedRequest());

    expect(mocks.sendTelegramToChat).not.toHaveBeenCalled();
    expect(mocks.sendTelegram).toHaveBeenCalledOnce();
    expect(mocks.mediaBulkWrite).toHaveBeenCalledOnce();
  });

  it("sends Android push with an independent delivery cursor", async () => {
    mocks.isAndroidPushConfigured.mockReturnValue(true);
    mockFindResults(
      [
        makeEntry({
          latest_remote_progress: 112,
          last_notified_progress: 113,
          last_push_notified_progress: 112,
        }),
      ],
      [
        makeUser({
          notifications_enabled: false,
          push_notifications_enabled: true,
          telegram_chat_id: null,
        }),
      ],
      [{ user_id: "user-1", token: "android-fcm-token" }],
    );
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    const response = await GET(authorizedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
    expect(mocks.sendAndroidPush).toHaveBeenCalledWith(
      ["android-fcm-token"],
      expect.objectContaining({
        title: "Chronicle Update",
        body: expect.stringContaining("Test Series"),
        path: "/updates",
      }),
      expect.any(AbortSignal),
    );
    expect(mocks.mediaBulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: "media-1" },
          update: { $max: { last_push_notified_progress: 113 } },
        },
      },
    ]);
    expect(body.data.push_users_notified).toBe(1);
  });
});

describe("cron time budget", () => {
  it("returns a partial success and defers a hung tracker", async () => {
    vi.useFakeTimers();
    process.env.CRON_TIME_BUDGET_MS = "10000";
    process.env.CRON_CHECK_CONCURRENCY = "1";
    mockFindResults([makeEntry()], [makeUser()]);
    mocks.scrapeTrackerUrl.mockImplementation(
      (_url: string, _mediaType: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("Scrape cancelled by caller")),
            { once: true },
          );
        }),
    );

    const responsePromise = GET(authorizedRequest());
    await vi.advanceTimersByTimeAsync(4_000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      selected: 1,
      started: 1,
      scanned: 0,
      deferred: 1,
      deadline_deferred: 1,
      partial: true,
    });
    expect(mocks.mediaUpdateOne).toHaveBeenCalledWith(
      { _id: "media-1" },
      { $set: { last_attempted_at: expect.any(Date) } },
    );
  });
});
