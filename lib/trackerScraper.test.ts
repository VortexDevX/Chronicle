import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeTrackerUrl } from "@/lib/trackerScraper";

describe("scheduled tracker scraping controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can skip same-run retries so later trackers get a turn", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrapeTrackerUrl("https://tracker.example/series", "Manhwa", {
        retryAttempts: 0,
      }),
    ).rejects.toThrow("network down");

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("honors an already-aborted cron deadline", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrapeTrackerUrl("https://tracker.example/series", "Manhwa", {
        signal: controller.signal,
        retryAttempts: 0,
      }),
    ).rejects.toThrow("Scrape cancelled by caller");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scrapes episode numbers for Donghua", async () => {
    const html = `
      <html>
        <body>
          <div class="lastend">
            <div class="inepcx"><span class="epcur">Episode 137</span></div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const latest = await scrapeTrackerUrl("https://animexin.dev/btth", "Donghua", {
      retryAttempts: 0,
    });
    expect(latest).toBe(137);
  });

  it("handles animexin 403 with actionable error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrapeTrackerUrl("https://animexin.dev/series/test", "Donghua", {
        retryAttempts: 0,
      }),
    ).rejects.toThrow("animexin is Cloudflare protected");
  });
});
