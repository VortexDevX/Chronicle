import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
const { aggregate } = vi.hoisted(() => ({ aggregate: vi.fn() }));
vi.mock("@/lib/models", () => ({ MediaItem: { aggregate } }));
import { sampleActiveMedia } from "./featured";
const owner = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
const current = "507f1f77bcf86cd799439012";
beforeEach(() => vi.clearAllMocks());
describe("random active story", () => {
  it("draws from the owner's entire active collection while excluding the current story", async () => {
    aggregate.mockResolvedValue([{ _id: "another", progress_current: 18.5 }]);
    expect(await sampleActiveMedia(owner, current)).toMatchObject({ _id: "another", progress_current: 18.5 });
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].$match).toEqual({ user_id: owner, status: { $in: ["Active", "Watching/Reading"] }, _id: { $ne: new mongoose.Types.ObjectId(current) } });
    expect(pipeline[1]).toEqual({ $sample: { size: 1 } });
  });
  it("falls back only within the same active collection when it has a single story", async () => {
    aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ _id: current }]);
    expect(await sampleActiveMedia(owner, current)).toMatchObject({ _id: current });
    expect(aggregate.mock.calls[1][0][0].$match).toEqual({ user_id: owner, status: { $in: ["Active", "Watching/Reading"] } });
  });
  it("returns no fabricated story for an empty active collection", async () => {
    aggregate.mockResolvedValue([]);
    expect(await sampleActiveMedia(owner)).toBeNull();
    expect(aggregate).toHaveBeenCalledTimes(1);
  });
});
