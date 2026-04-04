import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../api/utils/notify";

describe("Telegram HTML escaping", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes &", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("handles combined entities", () => {
    expect(escapeHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("does not escape normal text", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
