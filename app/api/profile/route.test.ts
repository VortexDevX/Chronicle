import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: vi.fn().mockResolvedValue({
    userId: "507f1f77bcf86cd799439011",
  }),
}));

vi.mock("@/lib/models", () => ({
  User: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { User } from "@/lib/models";

const findOneMock = User.findOne as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = User.findById as unknown as ReturnType<typeof vi.fn>;
const findByIdAndUpdateMock = User.findByIdAndUpdate as unknown as ReturnType<
  typeof vi.fn
>;

function selectResult<T>(value: T) {
  return { select: vi.fn().mockResolvedValue(value) };
}

describe("profile API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears verification when recovery email changes", async () => {
    findOneMock.mockReturnValue(selectResult(null));
    findByIdMock.mockReturnValue(selectResult({ email: "old@example.com" }));
    findByIdAndUpdateMock.mockReturnValue(
      selectResult({
        username: "reader",
        email: "new@example.com",
        email_verified_at: null,
        notifications_enabled: false,
        telegram_chat_id: null,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    const res = await PUT(
      new NextRequest("https://chronicle.example/api/profile", {
        method: "PUT",
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      { email: "new@example.com", email_verified_at: null },
      { new: true, runValidators: true },
    );
  });

  it("does not clear verification when unchanged email is submitted with other settings", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    findOneMock.mockReturnValue(selectResult(null));
    findByIdMock.mockReturnValue(selectResult({ email: "same@example.com" }));
    findByIdAndUpdateMock.mockReturnValue(
      selectResult({
        username: "reader",
        email: "same@example.com",
        email_verified_at: verifiedAt,
        notifications_enabled: true,
        telegram_chat_id: null,
        created_at: verifiedAt,
      }),
    );

    const res = await PUT(
      new NextRequest("https://chronicle.example/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          email: "same@example.com",
          notifications_enabled: true,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      { notifications_enabled: true },
      { new: true, runValidators: true },
    );
  });
});
