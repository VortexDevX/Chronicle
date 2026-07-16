import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  mediaFind: vi.fn(),
  mediaUpdateOne: vi.fn(),
  mediaBulkWrite: vi.fn(),
  userFind: vi.fn(),
  scrapeTrackerUrl: vi.fn(),
  sendTelegram: vi.fn(),
  sendTelegramToChat: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/models", () => ({
  MediaItem: {
    find: mocks.mediaFind,
    updateOne: mocks.mediaUpdateOne,
    bulkWrite: mocks.mediaBulkWrite,
  },
  User: { find: mocks.userFind },
}));
vi.mock("@/lib/notify", () => ({
  escapeHtml: (text: string) => text,
  sendTelegram: mocks.sendTelegram,
  sendTelegramToChat: mocks.sendTelegramToChat,
}));
vi.mock("@/lib/trackerScraper", () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
  isTransientScrapeError: () => false,
  scrapeTrackerUrl: mocks.scrapeTrackerUrl,
}));
vi.mock("@/lib/log", () => ({
  logInfo: vi.fn(),
  logInternalError: vi.fn(),
}));

import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

type Entry = {
  _id: string;
  user_id: string;
  title: string;
  media_type: "Manhwa" | "Donghua";
  progress_current: number;
  tracker_url: string;
  latest_remote_progress?: number | null;
  last_notified_progress?: number | null;
};

type User = {
  _id: string;
  username: string;
  notifications_enabled: boolean;
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

function mockFindResults(entries: Entry[], users: User[]) {
  const mediaQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  mediaQuery.select = vi.fn(() => mediaQuery);
  mediaQuery.sort = vi.fn(() => mediaQuery);
  mediaQuery.limit = vi.fn(() => mediaQuery);
  mediaQuery.lean = vi.fn().mockResolvedValue(entries);
  mocks.mediaFind.mockReturnValue(mediaQuery);

  const userQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  userQuery.select = vi.fn(() => userQuery);
  userQuery.lean = vi.fn().mockResolvedValue(users);
  mocks.userFind.mockReturnValue(userQuery);
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
});

afterEach(() => {
  process.env.CRON_SECRET = originalCronSecret;
  setNodeEnv(originalNodeEnv || "test");
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
  it("announces genuine new progress and preserves unread +N", async () => {
    mockFindResults([makeEntry()], [makeUser()]);
    mocks.scrapeTrackerUrl.mockResolvedValue(113);

    const res = await GET(authorizedRequest());

    expect(res.status).toBe(200);
    expect(mocks.sendTelegramToChat).toHaveBeenCalledOnce();
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
        $max: { last_notified_progress: 111 },
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
        $max: { last_notified_progress: 112 },
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
});
