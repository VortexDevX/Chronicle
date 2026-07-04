import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import {
  buildMediaMatch,
  buildMediaSortStage,
  escapeRegex,
  parseMediaListParams,
} from "@/lib/services/media/query";

describe("media query helpers", () => {
  it("escapes search regex input", () => {
    expect(escapeRegex("a+b?")).toBe("a\\+b\\?");
  });

  it("bounds pagination params", () => {
    const params = parseMediaListParams(
      new URLSearchParams("page=-4&limit=999&sort_by=rating"),
    );

    expect(params.page).toBe(1);
    expect(params.limit).toBe(100);
    expect(params.skip).toBe(0);
    expect(buildMediaSortStage(params.sortBy)).toEqual({
      rating: -1,
      last_updated: -1,
    });
  });

  it("maps Active status filter to current and legacy active values", () => {
    const userId = new mongoose.Types.ObjectId();
    const params = parseMediaListParams(new URLSearchParams("status=Active"));

    expect(buildMediaMatch(params, userId)).toMatchObject({
      user_id: userId,
      status: { $in: ["Active", "Watching/Reading"] },
    });
  });
});
