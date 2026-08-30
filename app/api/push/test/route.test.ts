import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthUserId: vi.fn(),
  enforceRateLimit: vi.fn(),
  userFindById: vi.fn(),
  deviceFind: vi.fn(),
  deleteMany: vi.fn(),
  isAndroidPushConfigured: vi.fn(),
  sendAndroidPush: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: mocks.requireAuthUserId,
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/models", () => ({
  User: { findById: mocks.userFindById },
  PushDevice: {
    find: mocks.deviceFind,
    deleteMany: mocks.deleteMany,
  },
}));
vi.mock("@/lib/push", () => ({
  isAndroidPushConfigured: mocks.isAndroidPushConfigured,
  sendAndroidPush: mocks.sendAndroidPush,
}));
vi.mock("@/lib/log", () => ({
  logInfo: vi.fn(),
  logInternalError: vi.fn(),
}));

import { POST } from "./route";

const userId = "507f1f77bcf86cd799439011";

function request() {
  return new NextRequest("https://chronicle.example/api/push/test", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthUserId.mockResolvedValue({ userId });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.isAndroidPushConfigured.mockReturnValue(true);
  mocks.userFindById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ push_notifications_enabled: true }),
    }),
  });
  mocks.deviceFind.mockReturnValue({
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ token: "firebase-device-id" }]),
        }),
      }),
    }),
  });
  mocks.deleteMany.mockResolvedValue({ deletedCount: 0 });
  mocks.sendAndroidPush.mockResolvedValue({
    configured: true,
    sent: 1,
    failed: 0,
    invalidTokens: [],
  });
});

describe("Android push test API", () => {
  it("sends a real test notification to registered devices", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.sendAndroidPush).toHaveBeenCalledWith(
      ["firebase-device-id"],
      expect.objectContaining({ path: "/updates" }),
    );
    await expect(response.json()).resolves.toMatchObject({
      data: { sent: 1, devices: 1 },
    });
  });

  it("explains when no Android device is registered", async () => {
    mocks.deviceFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "NO_PUSH_DEVICE",
    });
  });

  it("removes registrations Firebase reports as invalid", async () => {
    mocks.sendAndroidPush.mockResolvedValue({
      configured: true,
      sent: 0,
      failed: 1,
      invalidTokens: ["firebase-device-id"],
    });

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      user_id: userId,
      token: { $in: ["firebase-device-id"] },
    });
  });
});
