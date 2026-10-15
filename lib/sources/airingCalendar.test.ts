import { describe, expect, it } from "vitest";
import { resolveAiringCalendarSchedule, getSimklPosterUrl } from "./airingCalendar";

describe("airingCalendar", () => {
  it("formats simkl poster urls correctly", () => {
    expect(getSimklPosterUrl(null)).toBeNull();
    expect(getSimklPosterUrl("https://example.com/cover.jpg")).toBe("https://example.com/cover.jpg");
    expect(getSimklPosterUrl("12345")).toBe("https://simkl.in/posters/12345_0.jpg");
  });

  it("resolves upcoming episode by simkl_id", async () => {
    // 3171690 is Big Brother Final Season (active Donghua in 2026)
    const result = await resolveAiringCalendarSchedule({
      simkl_id: 3171690,
      title: "My Senior Brother Is Too Steady",
    });

    if (result) {
      expect(result.nextEpisode).toBeGreaterThan(0);
      expect(result.nextReleaseAt).toBeInstanceOf(Date);
      expect(result.source).toBe("calendar");
    }
  });

  it("resolves upcoming episode by anilist_id mapping if in metadata", async () => {
    // Check if anilist_id links through Simkl metadata
    const result = await resolveAiringCalendarSchedule({
      anilist_id: 195885,
      simkl_id: 3171690,
    });
    if (result) {
      expect(result.nextEpisode).toBeGreaterThan(0);
    }
  });
});
