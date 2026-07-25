import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  requireAuthUserId: vi.fn(),
  mediaFind: vi.fn(),
  mediaAggregate: vi.fn(),
  getUpdateFeed: vi.fn(),
  getActivitySnapshot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/guards", () => ({
  requireAuthUserId: mocks.requireAuthUserId,
}));
vi.mock("@/lib/models", () => ({
  MediaItem: { find: mocks.mediaFind, aggregate: mocks.mediaAggregate },
}));
vi.mock("@/lib/services/media/updateFeedQuery", () => ({
  getUpdateFeed: mocks.getUpdateFeed,
}));
vi.mock("@/lib/services/activity/query", () => ({
  getActivitySnapshot: mocks.getActivitySnapshot,
}));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));

import { GET } from "./route";

function mockActiveItems(items: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.sort = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.lean = vi.fn().mockResolvedValue(items);
  mocks.mediaFind.mockReturnValue(query);
  mocks.mediaAggregate.mockResolvedValue(items.slice(0, 1));
}

describe("home API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUserId.mockResolvedValue({
      userId: "507f1f77bcf86cd799439011",
    });
    mocks.getUpdateFeed.mockResolvedValue({ items: [], tracker_errors: [] });
    mocks.getActivitySnapshot.mockResolvedValue({ events: [], days: [] });
  });

  it("returns a complete empty contract for a new account", async () => {
    mockActiveItems([]);
    const response = await GET(new NextRequest("https://chronicle.test/api/home"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      featured: null,
      continue_items: [],
      updates: [],
      activity: [],
      rhythm: [],
    });
  });

  it("still returns useful Home data when optional collections are empty", async () => {
    mockActiveItems([{
      _id: "media-1",
      title: "Solo Leveling",
      status: "Active",
      progress_current: 7,
      progress_total: 12,
    }]);

    const response = await GET(new NextRequest("https://chronicle.test/api/home"));
    const body = await response.json();

    expect(body.data.featured.title).toBe("Solo Leveling");
    expect(body.data.continue_items).toHaveLength(1);
    expect(body.data.updates).toEqual([]);
  });

  it("uses a sampled active entry for the hero instead of the most recently updated item", async () => {
    mockActiveItems([
      { _id: "recent", title: "Recent", status: "Active", progress_current: 3, progress_total: 12 },
      { _id: "sampled", title: "Sampled", status: "Active", progress_current: 8, progress_total: 12 },
    ]);
    mocks.mediaAggregate.mockResolvedValue([
      { _id: "sampled", title: "Sampled", status: "Active", progress_current: 8, progress_total: 12 },
    ]);

    const response = await GET(new NextRequest("https://chronicle.test/api/home"));
    const body = await response.json();

    expect(body.data.featured.title).toBe("Sampled");
    expect(body.data.continue_items[0].title).toBe("Recent");
    expect(mocks.mediaAggregate).toHaveBeenCalledWith([
      expect.objectContaining({ $match: expect.any(Object) }),
      { $sample: { size: 1 } },
    ]);
  });

  it("keeps Home usable when seven-day activity is temporarily unavailable", async () => {
    mockActiveItems([{
      _id: "media-1",
      title: "Solo Leveling",
      status: "Active",
      progress_current: 7,
      progress_total: 12,
    }]);
    mocks.getActivitySnapshot.mockRejectedValue(new Error("activity unavailable"));

    const response = await GET(new NextRequest("https://chronicle.test/api/home"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.featured.title).toBe("Solo Leveling");
    expect(body.data.activity).toEqual([]);
    expect(body.data.rhythm).toEqual([]);
    expect(body.data.partial_failures).toEqual(["seven-day activity"]);
  });

  it("returns the authentication response without querying media", async () => {
    mocks.requireAuthUserId.mockResolvedValue({
      userId: null,
      errorResponse: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    });

    const response = await GET(new NextRequest("https://chronicle.test/api/home"));
    expect(response.status).toBe(401);
    expect(mocks.mediaFind).not.toHaveBeenCalled();
  });
});
