import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

afterEach(() => {
  process.env.CRON_SECRET = originalCronSecret;
  setNodeEnv(originalNodeEnv || "test");
});

describe("cron chapter check auth", () => {
  it("requires CRON_SECRET in production", async () => {
    process.env.CRON_SECRET = "";
    setNodeEnv("production");

    const res = await GET(
      new NextRequest("https://chronicle.example/api/cron/checkChapters"),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("CRON_SECRET_MISSING");
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    setNodeEnv("production");

    const res = await GET(
      new NextRequest("https://chronicle.example/api/cron/checkChapters", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
