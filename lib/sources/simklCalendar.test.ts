import { describe, expect, it } from "vitest";
import {
  findSimklEpisodeSchedule,
  matchSimklEntries,
  type SimklCalendarPayload,
} from "@/lib/sources/simklCalendar";

const payload: SimklCalendarPayload = {
  metadata: {
    "1": {
      title: "The Daily Life of the Immortal King",
      url: "/anime/1/example",
      ids: { simkl_id: 1, anilist: 114121 },
    },
    "2": {
      title: "From Old Country Bumpkin",
      url: "/anime/2/bumpkin",
      ids: { simkl_id: 2, anilist: 170000 },
    },
  },
  calendar: [
    {
      simkl_id: 1,
      date: "2026-08-30T08:00:00Z",
      finale_type: null,
      episode: {
        episode: 10,
        title: "Old episode",
        url: "https://simkl.com/anime/1/episode-10",
      },
    },
    {
      simkl_id: 1,
      date: "2026-09-06T08:00:00Z",
      finale_type: 2,
      episode: {
        episode: 11,
        title: "Finale",
        url: "https://simkl.com/anime/1/episode-11",
      },
    },
    {
      simkl_id: 2,
      date: "2026-09-02T08:00:00Z",
      finale_type: null,
      episode: {
        episode: 9,
        title: "Bumpkin Ep 9",
        url: "https://simkl.com/anime/2/episode-9",
      },
    },
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

  it("matches multiple entries and sorts them in ascending chronological order", () => {
    const entries = [
      { _id: "show-1", title: "Immortal King", simkl_id: 1, anilist_id: null },
      { _id: "show-2", title: "Country Bumpkin", simkl_id: null, anilist_id: 170000 },
    ];
    const { items } = matchSimklEntries(entries, payload, new Date("2026-09-01T00:00:00Z"));
    expect(items).toHaveLength(2);
    // Bumpkin airs Sep 2, Immortal King airs Sep 6
    expect(items[0].title).toBe("Country Bumpkin");
    expect(items[0].next_episode).toBe(9);
    expect(items[1].title).toBe("Immortal King");
    expect(items[1].next_episode).toBe(11);
  });
});
