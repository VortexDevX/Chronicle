import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  requireAuthUserId: vi.fn(),
  mediaFind: vi.fn(),
  mediaUpdateOne: vi.fn(),
  fetchAniListMediaBatch: vi.fn(),
  resolveAiringCalendarSchedule: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/guards", () => ({
  requireAuthUserId: mocks.requireAuthUserId,
}));
vi.mock("@/lib/models", () => ({
  MediaItem: {
    find: mocks.mediaFind,
    updateOne: mocks.mediaUpdateOne,
  },
}));
vi.mock("@/lib/sources/anilistAiring", () => ({
  fetchAniListMediaBatch: mocks.fetchAniListMediaBatch,
  formatAniListSchedule: vi.fn((m) => ({
    state: m.nextAiringEpisode ? "SCHEDULED" : "SCHEDULE_PENDING",
    nextEpisode: m.nextAiringEpisode?.episode ?? null,
    nextReleaseAt: m.nextAiringEpisode?.airingAt ? new Date(m.nextAiringEpisode.airingAt * 1000) : null,
    posterUrl: m.coverImage?.large ?? null,
  })),
}));
vi.mock("@/lib/sources/airingCalendar", () => ({
  resolveAiringCalendarSchedule: mocks.resolveAiringCalendarSchedule,
}));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));

import { GET } from "./route";

function mockEntries(items: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.sort = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.lean = vi.fn().mockResolvedValue(items);
  mocks.mediaFind.mockReturnValue(query);
}

describe("Release Radar API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUserId.mockResolvedValue({
      userId: "507f1f77bcf86cd799439011",
    });
    mocks.fetchAniListMediaBatch.mockResolvedValue(new Map());
    mocks.resolveAiringCalendarSchedule.mockResolvedValue(null);
  });

  it("sorts releases strictly in chronological date order", async () => {
    const entries = [
      {
        _id: "id-1",
        title: "Renegade Immortal",
        media_type: "Donghua",
        status: "Active",
        next_episode: 165,
        next_episode_release_at: new Date("2026-11-02T02:00:00Z"),
      },
      {
        _id: "id-2",
        title: "One Piece",
        media_type: "Anime",
        status: "Active",
        next_episode: 1181,
        next_episode_release_at: new Date("2027-01-03T14:16:00Z"),
      },
      {
        _id: "id-3",
        title: "Battle Through the Heavens S5",
        media_type: "Donghua",
        status: "Active",
        next_episode: 218,
        next_episode_release_at: new Date("2026-11-06T15:00:00Z"),
      },
      {
        _id: "id-4",
        title: "Shrouding the Heavens",
        media_type: "Donghua",
        status: "Active",
        next_episode: 188,
        next_episode_release_at: new Date("2026-11-03T09:00:00Z"),
      },
      {
        _id: "id-5",
        title: "The Great Ruler 2 Season",
        media_type: "Donghua",
        status: "Active",
        next_episode: 46,
        next_episode_release_at: new Date("2026-11-05T15:00:00Z"),
      },
    ];

    mockEntries(entries);

    const res = await GET(new NextRequest("https://chronicle.test/api/release-radar"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(5);
    const titlesInOrder = body.data.items.map((i: { title: string }) => i.title);
    expect(titlesInOrder).toEqual([
      "Renegade Immortal", // Nov 2
      "Shrouding the Heavens", // Nov 3
      "The Great Ruler 2 Season", // Nov 5
      "Battle Through the Heavens S5", // Nov 6
      "One Piece", // Jan 3
    ]);
  });

  it("keeps recently dropped episode visible when user is not caught up", async () => {
    // Airing time was 2 hours ago
    const airedTwoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const entries = [
      {
        _id: "id-1",
        title: "Renegade Immortal",
        media_type: "Donghua",
        status: "Active",
        progress_current: 164,
        next_episode: 165,
        next_episode_release_at: airedTwoHoursAgo,
      },
    ];

    mockEntries(entries);
    mocks.resolveAiringCalendarSchedule.mockResolvedValue({
      nextEpisode: 166,
      nextReleaseAt: new Date(Date.now() + 6 * 86400 * 1000),
      previousEpisode: 165,
      previousReleaseAt: airedTwoHoursAgo,
      posterUrl: null,
      source: "calendar",
    });

    const res = await GET(new NextRequest("https://chronicle.test/api/release-radar"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items[0].next_episode).toBe(165);
    expect(body.data.items[0].next_episode_release_at).toBe(airedTwoHoursAgo.toISOString());
  });

  it("advances to next episode when user is caught up to aired episode", async () => {
    const airedTwoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const futureDate = new Date(Date.now() + 6 * 86400 * 1000);
    const entries = [
      {
        _id: "id-1",
        title: "Renegade Immortal",
        media_type: "Donghua",
        status: "Active",
        progress_current: 165, // User caught up to 165
        next_episode: 165,
        next_episode_release_at: airedTwoHoursAgo,
      },
    ];

    mockEntries(entries);
    mocks.resolveAiringCalendarSchedule.mockResolvedValue({
      nextEpisode: 166,
      nextReleaseAt: futureDate,
      previousEpisode: 165,
      previousReleaseAt: airedTwoHoursAgo,
      posterUrl: null,
      source: "calendar",
    });

    const res = await GET(new NextRequest("https://chronicle.test/api/release-radar"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items[0].next_episode).toBe(166);
    expect(body.data.items[0].next_episode_release_at).toBe(futureDate.toISOString());
  });
});
