import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail, sendBrevoEmail } from "./email";

describe("lib/email (Resend)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_test_key_123",
      SENDER_EMAIL: "noreply@vxdev.in",
      SENDER_NAME: "ChronicleX",
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sends email via Resend API endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend_id_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({
      to: [{ email: "user@example.com", name: "User" }],
      subject: "Test Subject",
      htmlContent: "<p>Hello</p>",
      textContent: "Hello",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test_key_123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ChronicleX <noreply@vxdev.in>",
          to: ["user@example.com"],
          subject: "Test Subject",
          html: "<p>Hello</p>",
          text: "Hello",
        }),
      }),
    );
  });

  it("sendBrevoEmail is backward-compatible alias", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend_id_456" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendBrevoEmail({
      to: ["test@example.com"],
      subject: "Reset Password",
      html: "<p>Reset</p>",
      text: "Reset",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: JSON.stringify({
          from: "ChronicleX <noreply@vxdev.in>",
          to: ["test@example.com"],
          subject: "Reset Password",
          html: "<p>Reset</p>",
          text: "Reset",
        }),
      }),
    );
  });

  it("throws descriptive error on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Domain not verified",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendEmail({
        to: ["fail@example.com"],
        subject: "Fail",
      }),
    ).rejects.toThrow("Resend email failed: 403 Domain not verified");
  });
});
