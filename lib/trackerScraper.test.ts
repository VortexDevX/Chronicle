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
});
