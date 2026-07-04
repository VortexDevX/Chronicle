import { describe, expect, it, vi } from "vitest";
import { fetchAllMediaForExport } from "@/lib/services/media/exportMedia";

describe("media export", () => {
  it("fetches every page until has_more is false", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { items: [{ title: "A" }], has_more: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { items: [{ title: "B" }], has_more: false },
        }),
      });

    await expect(fetchAllMediaForExport(fetcher as typeof fetch)).resolves.toEqual([
      { title: "A" },
      { title: "B" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/media?page=1&limit=100&sort_by=last_updated",
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/media?page=2&limit=100&sort_by=last_updated",
    );
  });

  it("throws when a page request fails", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    await expect(fetchAllMediaForExport(fetcher as typeof fetch)).rejects.toThrow(
      "Export failed",
    );
  });
});
