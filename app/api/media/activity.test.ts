import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  requireAuthUserId: vi.fn(),
  enforceRateLimit: vi.fn(),
  mediaFindOne: vi.fn(),
  mediaFindOneAndUpdate: vi.fn(),
  mediaFindOneAndDelete: vi.fn(),
  activityCreate: vi.fn(),
  activityDeleteMany: vi.fn(),
  logInternalError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/guards", () => ({
  requireAuthUserId: mocks.requireAuthUserId,
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/rateLimit", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/models", () => ({
  MediaItem: {
    findOne: mocks.mediaFindOne,
    findOneAndUpdate: mocks.mediaFindOneAndUpdate,
    findOneAndDelete: mocks.mediaFindOneAndDelete,
  },
  ProgressActivity: {
    create: mocks.activityCreate,
    deleteMany: mocks.activityDeleteMany,
  },
}));
vi.mock("@/lib/log", () => ({
  logInternalError: mocks.logInternalError,
}));

import { DELETE, PUT } from "./route";

const userId = "507f1f77bcf86cd799439011";
const mediaId = "507f191e810c19729de860ea";

function mockExisting(progressCurrent: number) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.lean = vi.fn().mockResolvedValue({
    _id: mediaId,
    title: "Progress Test",
    media_type: "Manhwa",
    dedupe_key: "progress test",
    progress_current: progressCurrent,
  });
  mocks.mediaFindOne.mockReturnValue(query);
}

function progressRequest(progress: number) {
  return new NextRequest(
    `https://chronicle.test/api/media?id=${mediaId}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ progress_current: progress }),
    },
  );
}

describe("media progress activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUserId.mockResolvedValue({ userId });
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
    mocks.activityCreate.mockResolvedValue({});
    mocks.activityDeleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it.each([
    { previous: 10, next: 11.25, delta: 1.25 },
    { previous: 10, next: 9.5, delta: -0.5 },
  ])("records a $delta progress change after media succeeds", async ({
    previous,
    next,
    delta,
  }) => {
    mockExisting(previous);
    mocks.mediaFindOneAndUpdate.mockResolvedValue({
      _id: mediaId,
      progress_current: next,
    });

    const response = await PUT(progressRequest(next));
    expect(response.status).toBe(200);
    expect(mocks.activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        delta,
        media_id: expect.anything(),
        user_id: expect.anything(),
      }),
    );
  });

  it("preserves successful progress when activity recording fails", async () => {
    mockExisting(4);
    mocks.mediaFindOneAndUpdate.mockResolvedValue({
      _id: mediaId,
      progress_current: 5,
    });
    mocks.activityCreate.mockRejectedValue(new Error("activity unavailable"));

    const response = await PUT(progressRequest(5));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.progress_current).toBe(5);
    expect(mocks.logInternalError).toHaveBeenCalledWith(
      "media_activity_record_error",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("does not fabricate activity when progress is unchanged", async () => {
    mockExisting(5);
    mocks.mediaFindOneAndUpdate.mockResolvedValue({
      _id: mediaId,
      progress_current: 5,
    });

    await PUT(progressRequest(5));
    expect(mocks.activityCreate).not.toHaveBeenCalled();
  });

  it("deletes the media activity after its entry is removed", async () => {
    mocks.mediaFindOneAndDelete.mockResolvedValue({ _id: mediaId });
    const response = await DELETE(new NextRequest(
      `https://chronicle.test/api/media?id=${mediaId}`,
      { method: "DELETE" },
    ));

    expect(response.status).toBe(200);
    expect(mocks.activityDeleteMany).toHaveBeenCalledWith({
      user_id: expect.anything(),
      media_id: mediaId,
    });
  });
});
