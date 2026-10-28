import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAuthUserId: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  User: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
  PushDevice: {
    deleteOne: vi.fn(),
  },
}));

vi.mock("@/lib/config", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("secret"),
}));

vi.mock("@/lib/auth", () => ({
  signAuthToken: vi.fn().mockReturnValue("signed-token"),
  getAuthTokenClaims: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

vi.mock("@/lib/verification", () => ({
  createAndSendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

import { User } from "@/lib/models";
import { createAndSendVerificationEmail } from "@/lib/verification";

const findOneMock = User.findOne as unknown as ReturnType<typeof vi.fn>;
const createMock = User.create as unknown as ReturnType<typeof vi.fn>;
const createAndSendMock = createAndSendVerificationEmail as unknown as ReturnType<typeof vi.fn>;

describe("auth API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark registration email as verified", async () => {
    findOneMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    createMock.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      auth_version: 0,
    });

    const res = await POST(
      new NextRequest("https://chronicle.example/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "register",
          username: "reader",
          email: "reader@example.com",
          password: "secret123",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reader@example.com",
        email_verified_at: null,
      }),
    );
    expect(createAndSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reader@example.com",
        username: "reader",
        isWelcome: true,
      }),
    );
    const cookie = res.cookies.get("auth_token");
    expect(cookie?.value).toBe("signed-token");
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(cookie?.expires).toBeInstanceOf(Date);
  });

  it("clears auth_token cookie on logout with maxAge 0 and expires Date", async () => {
    const res = await POST(
      new NextRequest("https://chronicle.example/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      }),
    );

    expect(res.status).toBe(200);
    const cookie = res.cookies.get("auth_token");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.expires).toEqual(new Date(0));
  });
});
