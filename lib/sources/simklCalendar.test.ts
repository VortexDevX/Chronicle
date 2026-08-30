import { describe, expect, it } from "vitest";
import { findSimklEpisodeSchedule, type SimklCalendarPayload } from "@/lib/sources/simklCalendar";

const payload: SimklCalendarPayload = {
  metadata: {
    "1": { title: "The Daily Life of the Immortal King", url: "/anime/1/example", ids: { simkl_id: 1, anilist: 114121 } },
  },
  calendar: [
    { simkl_id: 1, date: "2026-08-30T08:00:00Z", finale_type: null, episode: { episode: 10, title: "Old episode", url: "https://simkl.com/anime/1/episode-10" } },
    { simkl_id: 1, date: "2026-09-06T08:00:00Z", finale_type: 2, episode: { episode: 11, title: "Finale", url: "https://simkl.com/anime/1/episode-11" } },
  ],
};

describe("SIMKL calendar matching", () => {
  it("joins a SIMKL ID to its upcoming episode", () => {
    const schedule = findSimklEpisodeSchedule(1, payload, new Date("2026-09-01T00:00:00Z"));
    expect(schedule).toMatchObject({ nextEpisode: 11, previousEpisode: 10, episodeTitle: "Finale", finaleType: 2 });
  });

  it("does not attach an unrelated ID", () => {
    expect(findSimklEpisodeSchedule(999, payload, new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});
