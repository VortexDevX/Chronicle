import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  clearAniListCache,
  deriveScheduleState,
  getDisplayTitle,
  formatAniListSchedule,
  fetchAniListMediaBatch,
  fetchAniListMediaById,
  searchAniListMedia,
  AniListMedia,
} from "./anilistAiring";

describe("anilistAiring", () => {
  beforeEach(() => {
    clearAniListCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearAniListCache();
  });

  describe("deriveScheduleState", () => {
    it("returns CONCLUDED for FINISHED or CANCELLED status", () => {
      const finished: AniListMedia = {
        id: 1,
        title: { english: "Show", romaji: null, native: null },
        countryOfOrigin: "JP",
        format: "TV",
        status: "FINISHED",
        episodes: 24,
        nextAiringEpisode: null,
        coverImage: null,
      };
      expect(deriveScheduleState(finished)).toBe("CONCLUDED");

      const cancelled = { ...finished, status: "CANCELLED" as const };
      expect(deriveScheduleState(cancelled)).toBe("CONCLUDED");
    });

    it("returns HIATUS for HIATUS status", () => {
      const hiatus: AniListMedia = {
        id: 2,
        title: { english: "Delayed Show", romaji: null, native: null },
        countryOfOrigin: "JP",
        format: "TV",
        status: "HIATUS",
        episodes: 12,
        nextAiringEpisode: null,
        coverImage: null,
      };
      expect(deriveScheduleState(hiatus)).toBe("HIATUS");
    });

    it("returns SCHEDULED when nextAiringEpisode is present", () => {
      const airing: AniListMedia = {
        id: 3,
        title: { english: "Active Show", romaji: null, native: null },
        countryOfOrigin: "JP",
        format: "TV",
        status: "RELEASING",
        episodes: 24,
        nextAiringEpisode: {
          episode: 13,
          airingAt: Math.floor(Date.now() / 1000) + 3600,
          timeUntilAiring: 3600,
        },
        coverImage: null,
      };
      expect(deriveScheduleState(airing)).toBe("SCHEDULED");
    });

    it("returns SCHEDULE_PENDING when releasing but no broadcast slot is confirmed", () => {
      const pending: AniListMedia = {
        id: 4,
        title: { english: "Pending Show", romaji: null, native: null },
        countryOfOrigin: "CN",
        format: "ONA",
        status: "RELEASING",
        episodes: 52,
        nextAiringEpisode: null,
        coverImage: null,
      };
      expect(deriveScheduleState(pending)).toBe("SCHEDULE_PENDING");
    });
  });

  describe("getDisplayTitle", () => {
    it("prefers English title with Romaji subtitle", () => {
      const { main, sub } = getDisplayTitle({
        english: "Solo Leveling",
        romaji: "Ore dake Level Up na Ken",
        native: "나 혼자만 레벨업",
      });
      expect(main).toBe("Solo Leveling");
      expect(sub).toBe("Ore dake Level Up na Ken");
    });

    it("falls back to Romaji if English is absent", () => {
      const { main, sub } = getDisplayTitle({
        english: null,
        romaji: "Doupo Cangqiong",
        native: "斗破苍穹",
      });
      expect(main).toBe("Doupo Cangqiong");
      expect(sub).toBe("斗破苍穹");
    });

    it("falls back to Native if English and Romaji are absent", () => {
      const { main, sub } = getDisplayTitle({
        english: null,
        romaji: null,
        native: "斗破苍穹",
      });
      expect(main).toBe("斗破苍穹");
      expect(sub).toBeNull();
    });
  });

  describe("formatAniListSchedule", () => {
    it("formats media into uniform schedule result", () => {
      const epochSeconds = 1770000000;
      const media: AniListMedia = {
        id: 114121,
        title: { english: "Jujutsu Kaisen", romaji: "Jujutsu Kaisen", native: "呪術廻戦" },
        countryOfOrigin: "JP",
        format: "TV",
        status: "RELEASING",
        episodes: 24,
        nextAiringEpisode: {
          episode: 15,
          airingAt: epochSeconds,
          timeUntilAiring: 1000,
        },
        coverImage: {
          extraLarge: "https://anilist.co/cover_xl.jpg",
          large: "https://anilist.co/cover_l.jpg",
          medium: "https://anilist.co/cover_m.jpg",
        },
      };

      const formatted = formatAniListSchedule(media);
      expect(formatted.anilistId).toBe(114121);
      expect(formatted.state).toBe("SCHEDULED");
      expect(formatted.nextEpisode).toBe(15);
      expect(formatted.nextReleaseAt).toEqual(new Date(epochSeconds * 1000));
      expect(formatted.posterUrl).toBe("https://anilist.co/cover_l.jpg");
    });
  });

  describe("fetchAniListMediaBatch and caching", () => {
    it("batches requests and caches subsequent calls", async () => {
      const mockMedia: AniListMedia = {
        id: 1001,
        title: { english: "Frieren", romaji: "Sousou no Frieren", native: null },
        countryOfOrigin: "JP",
        format: "TV",
        status: "FINISHED",
        episodes: 28,
        nextAiringEpisode: null,
        coverImage: { extraLarge: "cover.jpg", large: "cover.jpg", medium: null },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: {
            Page: {
              media: [mockMedia],
            },
          },
        }),
      } as unknown as Response);

      const batch1 = await fetchAniListMediaBatch([1001]);
      expect(batch1.get(1001)?.title.english).toBe("Frieren");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call should hit in-memory cache and not fetch again
      const batch2 = await fetchAniListMediaBatch([1001]);
      expect(batch2.get(1001)?.title.english).toBe("Frieren");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const single = await fetchAniListMediaById(1001);
      expect(single?.title.english).toBe("Frieren");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("handles rate-limit 429 response gracefully with backoff", async () => {
      const mockMedia: AniListMedia = {
        id: 2002,
        title: { english: "Test Show", romaji: null, native: null },
        countryOfOrigin: "JP",
        format: "TV",
        status: "RELEASING",
        episodes: 12,
        nextAiringEpisode: null,
        coverImage: null,
      };

      const headers429 = new Headers({ "retry-after": "1" });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: headers429,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            data: {
              Page: {
                media: [mockMedia],
              },
            },
          }),
        } as unknown as Response);

      const res = await fetchAniListMediaBatch([2002]);
      expect(res.get(2002)?.id).toBe(2002);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("searchAniListMedia", () => {
    it("returns formatted search results", async () => {
      const mockSearchItem: AniListMedia = {
        id: 5001,
        title: { english: "Battle Through the Heavens", romaji: "Doupo Cangqiong", native: "斗破苍穹" },
        countryOfOrigin: "CN",
        format: "ONA",
        status: "RELEASING",
        episodes: 104,
        nextAiringEpisode: { episode: 80, airingAt: 1770000000, timeUntilAiring: 2000 },
        coverImage: { extraLarge: "btth.jpg", large: "btth.jpg", medium: null },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: {
            Page: {
              media: [mockSearchItem],
            },
          },
        }),
      } as unknown as Response);

      const results = await searchAniListMedia("Battle Through", { countryOfOrigin: "CN" });
      expect(results.length).toBe(1);
      expect(results[0].anilistId).toBe(5001);
      expect(results[0].title).toBe("Battle Through the Heavens");
      expect(results[0].subtitle).toBe("Doupo Cangqiong");
      expect(results[0].countryOfOrigin).toBe("CN");
    });

    it("returns empty array for queries with fewer than 2 characters", async () => {
      const results = await searchAniListMedia("a");
      expect(results).toEqual([]);
    });
  });
});
