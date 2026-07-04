import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: vi.fn().mockResolvedValue({
    userId: "507f1f77bcf86cd799439011",
  }),
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/models", () => ({
  EmailVerificationToken: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
  },
  User: {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/email", () => ({
  sendBrevoEmail: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { sendBrevoEmail } from "@/lib/email";
import { EmailVerificationToken, User } from "@/lib/models";

const sendBrevoEmailMock = sendBrevoEmail as unknown as ReturnType<typeof vi.fn>;
const tokenUpdateManyMock = EmailVerificationToken.updateMany as unknown as ReturnType<typeof vi.fn>;
const tokenCreateMock = EmailVerificationToken.create as unknown as ReturnType<typeof vi.fn>;
const tokenFindOneMock = EmailVerificationToken.findOne as unknown as ReturnType<typeof vi.fn>;
const userFindByIdMock = User.findById as unknown as ReturnType<typeof vi.fn>;
const userFindOneAndUpdateMock = User.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>;

function selectResult<T>(value: T) {
  return { select: vi.fn().mockResolvedValue(value) };
}

describe("verify email API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a verification email for an unverified signed-in user", async () => {
    userFindByIdMock.mockReturnValue(
      selectResult({
        _id: "507f1f77bcf86cd799439011",
        username: "reader",
        email: "reader@example.com",
        email_verified_at: null,
      }),
    );
    tokenUpdateManyMock.mockResolvedValue({});
    tokenCreateMock.mockResolvedValue({});
    sendBrevoEmailMock.mockResolvedValue(undefined);

    const res = await POST(
      new NextRequest("https://chronicle.example/api/auth/verify-email", {
        method: "POST",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toBe("Verification email sent");
    expect(tokenCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "507f1f77bcf86cd799439011",
        email: "reader@example.com",
      }),
    );
    expect(sendBrevoEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "reader@example.com", name: "reader" }],
      }),
    );
  });

  it("marks matching email as verified and redirects to login", async () => {
    const verification = {
      user_id: "507f1f77bcf86cd799439011",
      email: "reader@example.com",
      used_at: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    tokenFindOneMock.mockResolvedValue(verification);
    userFindOneAndUpdateMock.mockReturnValue(selectResult({ _id: "u1" }));

    const res = await GET(
      new NextRequest("https://chronicle.example/api/auth/verify-email?token=abc"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://chronicle.example/login?email=verified",
    );
    expect(userFindOneAndUpdateMock).toHaveBeenCalledWith(
      {
        _id: "507f1f77bcf86cd799439011",
        email: "reader@example.com",
      },
      { email_verified_at: expect.any(Date) },
      { new: true },
    );
    expect(verification.save).toHaveBeenCalled();
  });
});
