import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAnimeCountdownSchedule,
  isAnimeCountdownUrl,
  parseAnimeCountdownPage,
} from "@/lib/sources/animeCountdown";

const SOURCE = "https://animecountdown.com/2620570/tales-of-herding-gods";
const donghuaFixture = `
  <countdown-content-page-info-right-title><h1>Tales of Herding Gods</h1></countdown-content-page-info-right-title>
  <countdown-content-page-item class="type-airing"><div>EP 99 TV Release (China)</div><div>Countdown to Episode 99<span data-ts="1788663600">September 6</span> on Bilibili</div></countdown-content-page-item>
  <countdown-content-page-item class="type-airing"><div>Episode 98 of Tales of Herding Gods aired at what time?</div><div>Episode 98 aired on <span data-ts="1788058800">August 30</span> on Bilibili</div></countdown-content-page-item>`;
const animeFixture = `
  <countdown-content-page-info-right-title><h1>Example Anime</h1></countdown-content-page-info-right-title>
  <countdown-content-page-item class="type-airing"><div>EP 12 TV Release (Japan)</div><div>Countdown to Episode 12<span data-ts="1767225600">January 1</span> on Tokyo MX</div></countdown-content-page-item>
  <countdown-content-page-item class="type-airing"><div>Episode 11 aired</div><div>Episode 11 aired on <span data-ts="1766620800">December 25</span> on Tokyo MX</div></countdown-content-page-item>`;

describe("Anime Countdown source adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses Donghua episode, platform, and canonical UTC timestamps", () => {
    const result = parseAnimeCountdownPage(donghuaFixture, SOURCE);
    expect(result).toMatchObject({ title: "Tales of Herding Gods", episode: 99, previousEpisode: 98, platform: "Bilibili" });
    expect(result.releaseAt?.toISOString()).toBe("2026-09-06T03:00:00.000Z");
    expect(result.previousReleaseAt?.toISOString()).toBe("2026-08-30T03:00:00.000Z");
  });

  it("parses Anime pages without using display timezone text", () => {
    const result = parseAnimeCountdownPage(animeFixture, SOURCE);
    expect(result.episode).toBe(12);
    expect(result.releaseAt?.getTime()).toBe(1767225600000);
    expect(result.platform).toBe("Tokyo MX");
  });

  it("rejects missing schedule markup instead of inventing progress", () => {
    expect(() => parseAnimeCountdownPage("<h1>nothing</h1>", SOURCE)).toThrow("schedule not found");
    expect(() => parseAnimeCountdownPage("", SOURCE)).toThrow("empty HTML");
  });

  it("accepts only canonical Anime Countdown HTTPS URLs", () => {
    expect(isAnimeCountdownUrl(SOURCE)).toBe(true);
    expect(isAnimeCountdownUrl("http://animecountdown.com/1/a")).toBe(false);
    expect(isAnimeCountdownUrl("https://animecountdown.com.evil.test/1/a")).toBe(false);
  });

  it("uses shared retry transport for network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAnimeCountdownSchedule(SOURCE, { retryAttempts: 0 })).rejects.toThrow("network down");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("honors caller cancellation before a source fetch", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAnimeCountdownSchedule(SOURCE, { signal: controller.signal, retryAttempts: 0 })).rejects.toThrow("Scrape cancelled by caller");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports transport timeouts distinctly", async () => {
    const timeout = new Error("aborted");
    timeout.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(fetchAnimeCountdownSchedule(SOURCE, { retryAttempts: 0 })).rejects.toThrow("Fetch timeout after");
  });
});
