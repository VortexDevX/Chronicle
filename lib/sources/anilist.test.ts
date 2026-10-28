import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAniListCache,
  fetchAniListMediaById,
  getDisplayTitle,
  searchAniListMedia,
} from "./anilist";

describe("anilist", () => {
  beforeEach(() => {
    clearAniListCache();
    vi.restoreAllMocks();
  });

  describe("getDisplayTitle", () => {
    it("prioritizes english then romaji then native", () => {
      expect(
        getDisplayTitle({ english: "Solo Leveling", romaji: "Ore dake", native: "나 혼자" }),
      ).toEqual({ main: "Solo Leveling", sub: "Ore dake" });

      expect(
        getDisplayTitle({ english: null, romaji: "Ore dake", native: "나 혼자" }),
      ).toEqual({ main: "Ore dake", sub: "나 혼자" });

      expect(
        getDisplayTitle({ english: null, romaji: null, native: "나 혼자" }),
      ).toEqual({ main: "나 혼자", sub: null });
    });
  });

  describe("fetchAniListMediaById and caching", () => {
    it("fetches media by id and uses cache on subsequent calls", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-ratelimit-remaining": "20" }),
        json: async () => ({
          data: {
            Media: {
              id: 1001,
              title: { english: "Solo Leveling", romaji: null, native: null },
              countryOfOrigin: "KR",
              format: "TV",
              status: "RELEASING",
              episodes: 12,
              coverImage: { extraLarge: "https://example.com/sl.jpg", large: null, medium: null },
            },
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const first = await fetchAniListMediaById(1001);
      expect(first).not.toBeNull();
      expect(first?.id).toBe(1001);
      expect(first?.title.english).toBe("Solo Leveling");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call should come from cache
      const second = await fetchAniListMediaById(1001);
      expect(second?.id).toBe(1001);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns null on invalid id", async () => {
      const res = await fetchAniListMediaById(-1);
      expect(res).toBeNull();
    });
  });

  describe("searchAniListMedia", () => {
    it("returns parsed search results with english titles and country filter", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-ratelimit-remaining": "25" }),
        json: async () => ({
          data: {
            Page: {
              media: [
                {
                  id: 999,
                  title: { english: "Battle Through the Heavens", romaji: "Doupo Cangqiong", native: "斗破苍穹" },
                  countryOfOrigin: "CN",
                  format: "ONA",
                  status: "RELEASING",
                  episodes: 104,
                  coverImage: { extraLarge: "https://example.com/btth.jpg", large: null, medium: null },
                },
              ],
            },
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const results = await searchAniListMedia("Battle Through", { countryOfOrigin: "CN" });
      expect(results).toHaveLength(1);
      expect(results[0].anilistId).toBe(999);
      expect(results[0].title).toBe("Battle Through the Heavens");
      expect(results[0].subtitle).toBe("Doupo Cangqiong");
      expect(results[0].countryOfOrigin).toBe("CN");
    });

    it("returns empty array for short query", async () => {
      const results = await searchAniListMedia("a");
      expect(results).toEqual([]);
    });
  });
});
