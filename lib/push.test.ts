import { afterEach, describe, expect, it } from "vitest";
import { isAndroidPushConfigured, sendAndroidPush } from "./push";

const originalProjectId = process.env.FIREBASE_PROJECT_ID;
const originalClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const originalPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

afterEach(() => {
  process.env.FIREBASE_PROJECT_ID = originalProjectId;
  process.env.FIREBASE_CLIENT_EMAIL = originalClientEmail;
  process.env.FIREBASE_PRIVATE_KEY = originalPrivateKey;
});

describe("Android push configuration", () => {
  it("degrades safely when Firebase is not configured", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    expect(isAndroidPushConfigured()).toBe(false);
    await expect(
      sendAndroidPush(["token"], {
        title: "Chronicle Update",
        body: "One new release",
        path: "/updates",
      }),
    ).resolves.toEqual({
      configured: false,
      sent: 0,
      failed: 0,
      invalidTokens: [],
    });
  });

  it("requires a PEM private key before enabling push", () => {
    process.env.FIREBASE_PROJECT_ID = "chronicle-test";
    process.env.FIREBASE_CLIENT_EMAIL = "firebase@example.test";
    process.env.FIREBASE_PRIVATE_KEY = "not-a-private-key";

    expect(isAndroidPushConfigured()).toBe(false);
  });
});
