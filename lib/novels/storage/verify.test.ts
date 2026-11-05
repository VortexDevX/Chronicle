import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("./r2", () => ({ getObject: vi.fn(), headObject: vi.fn() }));
import { getObject, headObject } from "./r2";
import { hash, verifyObject } from "./verify";
describe("private upload verification", () => {
  const body = Buffer.from("Chapter body");
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(headObject).mockResolvedValue({ ContentLength: body.length, ContentType: "text/plain; charset=utf-8", $metadata: {} }); vi.mocked(getObject).mockResolvedValue(body); });
  it("verifies bytes and hash before accepting chapter content", async () => {
    expect(await verifyObject("novels/example/chapters/000001.txt",body.length,hash(body),"text/plain; charset=utf-8")).toEqual(body);
  });
  it("rejects checksum mismatch", async () => {
    await expect(verifyObject("key",body.length,"0".repeat(64),"text/plain; charset=utf-8")).rejects.toThrow("checksum");
  });
  it("rejects missing or wrongly sized uploads before downloading", async () => {
    vi.mocked(headObject).mockResolvedValue(null);
    await expect(verifyObject("key",body.length,hash(body),"text/plain; charset=utf-8")).rejects.toThrow("size or type");
    expect(getObject).not.toHaveBeenCalled();
  });
  it("rejects text disguised as an avatar image", async () => {
    vi.mocked(headObject).mockResolvedValue({ ContentLength: body.length, ContentType: "image/png", $metadata:{} });
    await expect(verifyObject("avatar",body.length,hash(body),"image/png")).rejects.toThrow("Invalid image content");
  });
});
