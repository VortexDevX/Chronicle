import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthUserId: vi.fn(),
  enforceRateLimit: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: mocks.requireAuthUserId,
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/models", () => ({
  PushDevice: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    deleteOne: mocks.deleteOne,
  },
  User: { updateOne: mocks.updateOne },
}));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));

import { DELETE, POST } from "./route";

const installationId = "d9428888-122b-4a5f-9f6c-21eb1d1fe001";
const userId = "507f1f77bcf86cd799439011";

function request(method: "POST" | "DELETE", body?: object) {
  return new NextRequest("https://chronicle.example/api/push/devices", {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `chronicle_android_installation=${installationId}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthUserId.mockResolvedValue({ userId });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.findOne.mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  });
  mocks.findOneAndUpdate.mockResolvedValue({ _id: "device-1" });
  mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
  mocks.updateOne.mockResolvedValue({ acknowledged: true });
});

describe("Android push device API", () => {
  it("registers the FCM token against the authenticated installation", async () => {
    const response = await POST(
      request("POST", {
        token: "fcm-token-value-that-is-long-enough",
        appVersion: "1.0.0",
        enableNotifications: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { installation_id: installationId },
      {
        $set: expect.objectContaining({
          user_id: userId,
          token: "fcm-token-value-that-is-long-enough",
          platform: "android",
          app_version: "1.0.0",
        }),
      },
      expect.objectContaining({ upsert: true, runValidators: true }),
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { push_notifications_enabled: true } },
    );
  });

  it("rejects registration without a native installation cookie", async () => {
    const response = await POST(
      new NextRequest("https://chronicle.example/api/push/devices", {
        method: "POST",
        body: JSON.stringify({ token: "fcm-token-value-that-is-long-enough" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("removes only the current user's installation", async () => {
    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    expect(mocks.deleteOne).toHaveBeenCalledWith({
      user_id: userId,
      installation_id: installationId,
    });
  });

  it("does not let another account take over an installation id", async () => {
    mocks.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ user_id: "another-user" }),
      }),
    });

    const response = await POST(
      request("POST", { token: "fcm-registration-that-is-long-enough" }),
    );

    expect(response.status).toBe(409);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
