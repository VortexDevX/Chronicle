import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  ProgressActivity: { aggregate: mocks.aggregate },
}));

import mongoose from "mongoose";
import { emptyActivityDays, getActivitySnapshot } from "./query";

describe("seven-day progress activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns exactly seven honest UTC days with no fabricated history", () => {
    expect(emptyActivityDays(new Date("2026-07-25T17:30:00Z"))).toEqual([
      { date: "2026-07-19", units: 0, events: 0 },
      { date: "2026-07-20", units: 0, events: 0 },
      { date: "2026-07-21", units: 0, events: 0 },
      { date: "2026-07-22", units: 0, events: 0 },
      { date: "2026-07-23", units: 0, events: 0 },
      { date: "2026-07-24", units: 0, events: 0 },
      { date: "2026-07-25", units: 0, events: 0 },
    ]);
  });

  it("keeps negative corrections in history but only maps positive rhythm", async () => {
    mocks.aggregate.mockResolvedValue([{
      recent: [{
        _id: "activity-1",
        media_id: "media-1",
        delta: -0.5,
        occurred_at: new Date("2026-07-25T10:00:00Z"),
        media: [{ title: "Correction", media_type: "Manhwa" }],
      }],
      daily: [{ _id: "2026-07-24", units: 1.25, events: 1 }],
    }]);

    const result = await getActivitySnapshot(
      new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
      8,
      new Date("2026-07-25T17:30:00Z"),
    );

    expect(result.events[0]).toMatchObject({
      title: "Correction",
      delta: -0.5,
    });
    expect(result.days.find((day) => day.date === "2026-07-24")).toEqual({
      date: "2026-07-24",
      units: 1.25,
      events: 1,
    });
    const pipeline = mocks.aggregate.mock.calls[0][0];
    expect(pipeline[1].$facet.daily[0]).toEqual({
      $match: { delta: { $gt: 0 } },
    });
  });
});
