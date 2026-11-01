import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sample: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireAuthUserId: mocks.auth }));
vi.mock("@/lib/services/media/featured", () => ({ sampleActiveMedia: mocks.sample }));
vi.mock("@/lib/log", () => ({ logInternalError: vi.fn() }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "507f1f77bcf86cd799439011" }); });
it("returns a fresh private draw, without a fixed rotation batch", async () => {
  mocks.sample.mockResolvedValue({ _id: "next" });
  const response = await GET(new NextRequest("https://chronicle.test/api/home/featured?exclude=507f1f77bcf86cd799439012"));
  expect(String(mocks.sample.mock.calls[0][0])).toBe("507f1f77bcf86cd799439011");
  expect(mocks.sample.mock.calls[0][1]).toBe("507f1f77bcf86cd799439012");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ data: { featured: { _id: "next" } } });
});
it("rejects invalid story IDs without executing a query", async () => {
  const response = await GET(new NextRequest("https://chronicle.test/api/home/featured?exclude=invalid"));
  expect(response.status).toBe(400); expect(mocks.sample).not.toHaveBeenCalled();
});
it("requires a real authenticated account before drawing media", async () => {
  mocks.auth.mockResolvedValue({ userId: null, errorResponse: NextResponse.json({}, { status: 401 }) });
  const response = await GET(new NextRequest("https://chronicle.test/api/home/featured"));
  expect(response.status).toBe(401); expect(mocks.sample).not.toHaveBeenCalled();
});
