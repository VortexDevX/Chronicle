import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  requireAuthUserId: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/guards", () => ({ requireAuthUserId: mocks.requireAuthUserId }));
vi.mock("@/lib/models", () => ({ CronHistory: { find: mocks.find } }));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.requireAuthUserId.mockResolvedValue({
    userId: "507f1f77bcf86cd799439011",
    errorResponse: null,
  });
});

describe("cron history", () => {
  it("returns only current user's recent history with a bounded limit", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.sort = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.maxTimeMS = vi.fn(() => query);
    query.lean = vi.fn().mockResolvedValue([{ status: "success" }]);
    mocks.find.mockReturnValue(query);

    const response = await GET(
      new NextRequest("https://chronicle.example/api/cron/history?limit=500"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      user_id: expect.objectContaining({}),
    });
    expect(query.select).toHaveBeenCalledWith("-user_id -expires_at");
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(body.data).toEqual({
      items: [{ status: "success" }],
      retention_days: 30,
    });
  });
});
