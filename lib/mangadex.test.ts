import { describe, expect, it } from "vitest";
import { normalizeMangaDexId } from "@/lib/mangadex";

const ID = "32a1d4e2-e7f2-4d7e-8e7a-1234567890ab";

describe("normalizeMangaDexId", () => {
  it("keeps a raw MangaDex UUID", () => {
    expect(normalizeMangaDexId(ID.toUpperCase())).toBe(ID);
  });

  it("extracts the UUID from a copied MangaDex title URL", () => {
    expect(
      normalizeMangaDexId(`https://mangadex.org/title/${ID}/a-title?tab=chapters`),
    ).toBe(ID);
  });

  it("extracts the UUID from a MangaDex API URL", () => {
    expect(normalizeMangaDexId(`https://api.mangadex.org/manga/${ID}`)).toBe(ID);
  });

  it("rejects other sites and malformed IDs", () => {
    expect(normalizeMangaDexId(`https://example.com/title/${ID}`)).toBeNull();
    expect(normalizeMangaDexId("not-an-id")).toBeNull();
  });
});
