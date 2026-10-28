import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/rateLimit", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/sources/anilist", () => ({
  searchAniListMedia: vi.fn().mockResolvedValue([
    {
      anilistId: 101,
      title: "Frieren: Beyond Journey's End",
      subtitle: "Sousou no Frieren",
      countryOfOrigin: "JP",
      posterUrl: "https://anilist.co/frieren.jpg",
      totalEpisodes: 28,
      status: "FINISHED",
    },
    {
      anilistId: 202,
      title: "Soul Land 2",
      subtitle: "Douluo Dalu II",
      countryOfOrigin: "CN",
      posterUrl: "https://anilist.co/soulland2.jpg",
      totalEpisodes: 52,
      status: "RELEASING",
    },
  ]),
}));

vi.mock("@/lib/externalFetch", () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          {
            id: "manga-uuid-1",
            attributes: {
              title: { en: "Solo Leveling" },
              publicationDemographic: "shounen",
              lastChapter: "200",
              status: "completed",
            },
            relationships: [
              {
                type: "cover_art",
                attributes: { fileName: "solo.jpg" },
              },
            ],
          },
        ],
      }),
      { status: 200 },
    ),
  ),
}));

import { GET } from "./route";

describe("Unified Omnisearch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty items for queries shorter than 2 characters", async () => {
    const req = new NextRequest("https://chronicle.example/api/search/unified?q=a");
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.items).toEqual([]);
  });

  it("returns combined results from AniList and MangaDex", async () => {
    const req = new NextRequest("https://chronicle.example/api/search/unified?q=Solo");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.items).toHaveLength(3);

    const types = json.data.items.map((i: any) => i.mediaType);
    expect(types).toContain("Anime");
    expect(types).toContain("Donghua");
    expect(types).toContain("Manhwa");

    const manhwa = json.data.items.find((i: any) => i.mediaType === "Manhwa");
    expect(manhwa.title).toBe("Solo Leveling");
    expect(manhwa.source).toBe("mangadex");
    expect(manhwa.mangadexId).toBe("manga-uuid-1");
  });

  it("filters by media type when specified", async () => {
    const req = new NextRequest("https://chronicle.example/api/search/unified?q=Soul&type=Donghua");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const types = json.data.items.map((i: any) => i.mediaType);
    expect(types).not.toContain("Manhwa");
  });
});
