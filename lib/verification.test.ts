import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  create: vi.fn(),
  sendEmail: vi.fn(),
  logInfo: vi.fn(),
  logInternalError: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  EmailVerificationToken: {
    updateMany: mocks.updateMany,
    create: mocks.create,
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/log", () => ({
  logInfo: mocks.logInfo,
  logInternalError: mocks.logInternalError,
}));

import { createAndSendVerificationEmail } from "./verification";

describe("lib/verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates token, renders email, and sends welcome verification email", async () => {
    mocks.updateMany.mockResolvedValue({});
    mocks.create.mockResolvedValue({});
    mocks.sendEmail.mockResolvedValue(undefined);

    const success = await createAndSendVerificationEmail({
      userId: "user-123",
      email: "newuser@example.com",
      username: "NewUser",
      originFallback: "https://chronicle.app",
      isWelcome: true,
    });

    expect(success).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      { user_id: "user-123", used_at: null },
      { $set: { used_at: expect.any(Date) } },
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        email: "newuser@example.com",
        token_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "newuser@example.com", name: "NewUser" }],
        subject: expect.stringContaining("Welcome to Chronicle"),
        html: expect.stringContaining("Verify Email & Get Started"),
        text: expect.stringContaining("Welcome to Chronicle"),
      }),
    );
  });

  it("handles email sending errors gracefully without throwing", async () => {
    mocks.updateMany.mockResolvedValue({});
    mocks.create.mockResolvedValue({});
    mocks.sendEmail.mockRejectedValue(new Error("SMTP down"));

    const success = await createAndSendVerificationEmail({
      userId: "user-123",
      email: "newuser@example.com",
      username: "NewUser",
      originFallback: "https://chronicle.app",
      isWelcome: false,
    });

    expect(success).toBe(false);
    expect(mocks.logInternalError).toHaveBeenCalled();
  });
});
