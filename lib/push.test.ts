import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/externalFetch", () => ({ fetchWithTimeout: mocks.fetch }));
vi.mock("@/lib/log", () => ({ logInfo: mocks.log, logInternalError: mocks.log }));
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

describe("Android push delivery", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); mocks.fetch.mockReset();
    process.env.FIREBASE_PROJECT_ID = "chronicle-test";
    process.env.FIREBASE_CLIENT_EMAIL = "firebase@example.test";
    process.env.FIREBASE_PRIVATE_KEY = key;
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access", expires_in: 3600 }), { status: 200 }));
  });
  const payload = { title: "Test", body: "Test delivery", path: "/updates" };
  const failure = (status: number, code: string, fcm = false) => new Response(JSON.stringify({ error: { status: code, details: fcm ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code }] : [] } }), { status });
  it("removes only registrations explicitly reported as unregistered", async () => {
    mocks.fetch.mockResolvedValueOnce(failure(404, "UNREGISTERED", true));
    const result = await (await import("./push")).sendAndroidPush(["registration"], payload);
    expect(result).toMatchObject({ sent: 0, failed: 1, invalidTokens: ["registration"], failureCodes: ["UNREGISTERED"] });
  });
  it("preserves valid device records when a project or endpoint returns a generic 404", async () => {
    mocks.fetch.mockResolvedValueOnce(failure(404, "NOT_FOUND"));
    const result = await (await import("./push")).sendAndroidPush(["private-registration"], payload);
    expect(result.invalidTokens).toEqual([]);
    expect(result.failureCodes).toEqual(["NOT_FOUND"]);
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("private-registration");
  });
  it("reports transient Firebase failure without retrying an uncertain delivery", async () => {
    mocks.fetch.mockResolvedValueOnce(failure(503, "UNAVAILABLE"));
    const result = await (await import("./push")).sendAndroidPush(["registration"], payload);
    expect(result).toMatchObject({ sent: 0, failed: 1, invalidTokens: [], failureCodes: ["UNAVAILABLE"] });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("reports timeout separately and keeps the registration for a later attempt", async () => {
    mocks.fetch.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    const result = await (await import("./push")).sendAndroidPush(["registration"], payload);
    expect(result).toMatchObject({ invalidTokens: [], failureCodes: ["TIMEOUT"] });
  });
  it("exposes an authentication failure without leaking the OAuth response", async () => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce(new Response("private authentication response", { status: 401 }));
    const result = await (await import("./push")).sendAndroidPush(["registration"], payload);
    expect(result).toMatchObject({ invalidTokens: [], failureCodes: ["AUTHENTICATION_FAILED"] });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("private authentication response");
  });
  it("still delivers to an existing FID without changing its identity or duplicating sends", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ name: "projects/test/messages/test" }), { status: 200 }));
    const result = await (await import("./push")).sendAndroidPush(["c1234567890123456789012", "c1234567890123456789012"], payload);
    expect(result).toMatchObject({ sent: 1, failed: 0, invalidTokens: [] });
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).message.token).toBe("c1234567890123456789012");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("classifies malformed signing credentials as authentication failure", async () => {
    process.env.FIREBASE_PRIVATE_KEY = key.split("\n").map((line, index) => index === 1 ? "invalid" : line).join("\n");
    const result = await (await import("./push")).sendAndroidPush(["registration"], payload);
    expect(result.failureCodes).toEqual(["AUTHENTICATION_FAILED"]);
    expect(result.invalidTokens).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
