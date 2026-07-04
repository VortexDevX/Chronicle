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
}));

vi.mock("@/lib/config", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("secret"),
}));

vi.mock("@/lib/auth", () => ({
  signAuthToken: vi.fn().mockReturnValue("signed-token"),
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { User } from "@/lib/models";

const findOneMock = User.findOne as unknown as ReturnType<typeof vi.fn>;
const createMock = User.create as unknown as ReturnType<typeof vi.fn>;

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
  });
});
