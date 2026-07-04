import { describe, expect, it } from "vitest";
import { planMediaDedupeBackfill } from "@/lib/services/media/dedupeBackfill";

describe("media dedupe backfill planner", () => {
  it("updates first unkeyed item in a group and skips duplicates", () => {
    const plan = planMediaDedupeBackfill([
      {
        _id: "1",
        user_id: "u1",
        media_type: "Anime",
        title: "One Piece",
      },
      {
        _id: "2",
        user_id: "u1",
        media_type: "Anime",
        title: " one   piece ",
      },
      {
        _id: "3",
        user_id: "u1",
        media_type: "Manhwa",
        title: "One Piece",
      },
    ]);

    expect(plan.updates).toEqual([
      { id: "1", dedupe_key: "one piece" },
      { id: "3", dedupe_key: "one piece" },
    ]);
    expect(plan.skipped).toEqual([
      { id: "2", reason: "duplicate_group" },
    ]);
  });

  it("respects existing keyed items when planning unkeyed rows", () => {
    const plan = planMediaDedupeBackfill([
      {
        _id: "1",
        user_id: "u1",
        media_type: "Anime",
        title: "Bleach",
        dedupe_key: "bleach",
      },
      {
        _id: "2",
        user_id: "u1",
        media_type: "Anime",
        title: " bleach ",
      },
    ]);

    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([
      { id: "2", reason: "duplicate_group" },
    ]);
  });
});
