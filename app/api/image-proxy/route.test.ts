import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/externalFetch", () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));

import { GET } from "./route";

function requestFor(url = "https://images.example/poster.png") {
  return new NextRequest(
    `https://chronicle.test/api/image-proxy?url=${encodeURIComponent(url)}`,
  );
}

describe("image proxy validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-image and SVG upstream content", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response("<svg />", {
      status: 200,
      headers: { "content-type": "image/svg+xml" },
    }));

    const response = await GET(requestFor());
    expect(response.status).toBe(415);
  });

  it("rejects images that advertise more than ten megabytes", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(10 * 1024 * 1024 + 1),
      },
    }));

    const response = await GET(requestFor());
    expect(response.status).toBe(413);
  });

  it("returns a validated image with a stable content type", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: { "content-type": "image/png; charset=binary" },
    }));

    const response = await GET(requestFor());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});
