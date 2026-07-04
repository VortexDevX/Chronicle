import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  MediaItem: {
    aggregate: vi.fn(),
  },
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { requireAuthUserId } from "@/lib/guards";
import { MediaItem } from "@/lib/models";

const requireAuthUserIdMock = vi.mocked(requireAuthUserId);
const aggregateMock = vi.mocked(MediaItem.aggregate);

describe("analytics API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth errors before aggregating", async () => {
    requireAuthUserIdMock.mockResolvedValue({
      userId: null,
      errorResponse: NextResponse.json(
        { ok: false, code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    });

    const res = await GET(new NextRequest("https://chronicle.example/api/analytics"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("returns normalized analytics data", async () => {
    requireAuthUserIdMock.mockResolvedValue({
      userId: "507f1f77bcf86cd799439011",
    });
    aggregateMock.mockResolvedValue([
      {
        totals: [
          {
            total: 2,
            ratedCount: 1,
            avgRating: 9,
            totalProgress: 20,
            completed: 1,
          },
        ],
        byStatus: [
          { _id: "Completed", count: 1 },
          { _id: "Active", count: 1 },
        ],
        byType: [{ _id: "Anime", count: 2 }],
        recentItems: [],
        topRated: [],
      },
    ]);

    const res = await GET(new NextRequest("https://chronicle.example/api/analytics"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      total: 2,
      byStatus: { Active: 1, Completed: 1 },
      byType: { Anime: 2, Manhwa: 0 },
      avgRating: 9,
      completionRate: 50,
    });
  });
});
