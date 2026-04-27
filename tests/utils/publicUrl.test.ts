import { describe, expect, it } from "vitest";
import { normalizePublicHttpUrl } from "../../api/_utils/publicUrl.js";

describe("normalizePublicHttpUrl", () => {
  it("normalizes public http and https URLs", () => {
    expect(normalizePublicHttpUrl("https://example.com/a path")).toBe(
      "https://example.com/a%20path",
    );
    expect(normalizePublicHttpUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects non-http protocols", () => {
    expect(normalizePublicHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePublicHttpUrl("data:text/html,hello")).toBeNull();
  });

  it("rejects localhost and private-network hosts", () => {
    expect(normalizePublicHttpUrl("http://localhost/avatar.png")).toBeNull();
    expect(normalizePublicHttpUrl("http://app.local/avatar.png")).toBeNull();
    expect(normalizePublicHttpUrl("http://127.0.0.1/avatar.png")).toBeNull();
    expect(normalizePublicHttpUrl("http://10.0.0.5/avatar.png")).toBeNull();
    expect(normalizePublicHttpUrl("http://172.16.0.5/avatar.png")).toBeNull();
    expect(normalizePublicHttpUrl("http://192.168.1.10/avatar.png")).toBeNull();
  });

  it("rejects URLs longer than the public URL limit", () => {
    expect(normalizePublicHttpUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });
});
