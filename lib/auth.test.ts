import { afterEach, describe, expect, it, vi } from "vitest";
import { signAuthToken, verifyAuthToken } from "./auth";

describe("verifyAuthToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a valid Chronicle session token", () => {
    vi.stubEnv("JWT_SECRET", "landing-page-session-test-secret");
    const token = signAuthToken("user-123", 4);

    expect(verifyAuthToken(token)).toEqual({
      userId: "user-123",
      authVersion: 4,
    });
  });

  it("rejects missing or invalid session tokens", () => {
    vi.stubEnv("JWT_SECRET", "landing-page-session-test-secret");

    expect(verifyAuthToken()).toBeNull();
    expect(verifyAuthToken("not-a-valid-token")).toBeNull();
  });
});
