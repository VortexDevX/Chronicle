import { describe, expect, it } from "vitest";
import {
  buildTitleKey,
  validateMediaPayload,
} from "@/lib/services/media/validation";

describe("media validation", () => {
  it("normalizes title keys case-insensitively with collapsed whitespace", () => {
    expect(buildTitleKey("  One   Piece  ")).toBe("one piece");
  });

  it("accepts valid media payloads", () => {
    const result = validateMediaPayload({
      title: "Solo Leveling",
      media_type: "Manhwa",
      status: "Active",
      progress_current: 10.8,
      progress_total: 100,
      rating: 8,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.progress_current).toBe(10.8);
    }
  });

  it("rejects progress beyond total", () => {
    expect(
      validateMediaPayload({
        title: "Bad Progress",
        media_type: "Anime",
        status: "Active",
        progress_current: 12,
        progress_total: 10,
      }),
    ).toEqual({
      ok: false,
      message: "progress_current cannot exceed progress_total",
    });
  });

  it("rejects private tracker URLs", () => {
    expect(
      validateMediaPayload(
        {
          tracker_url: "http://127.0.0.1:3000/test",
        },
        true,
      ),
    ).toEqual({
      ok: false,
      message:
        "tracker_url must be a valid public http/https URL under 500 characters",
    });
  });

  it("stores only the ID from a copied MangaDex URL", () => {
    const id = "32a1d4e2-e7f2-4d7e-8e7a-1234567890ab";
    const result = validateMediaPayload(
      { mangadex_id: `https://mangadex.org/title/${id}/solo-leveling` },
      true,
    );

    expect(result).toEqual({
      ok: true,
      normalized: { mangadex_id: id },
    });
  });

  it("rejects a non-MangaDex URL in the MangaDex field", () => {
    expect(
      validateMediaPayload(
        { mangadex_id: "https://example.com/title/not-mangadex" },
        true,
      ),
    ).toEqual({
      ok: false,
      message: "Paste a valid MangaDex title URL or MangaDex ID",
    });
  });
});
