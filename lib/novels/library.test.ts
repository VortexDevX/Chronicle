import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), find: vi.fn(), novel: vi.fn() }));
vi.mock("@/lib/models", () => ({ MediaItem: { findOneAndUpdate: mocks.update, findOne: mocks.find }, User: {} }));
vi.mock("./models/Novel", () => ({ default: { findOne: () => ({ lean: mocks.novel }) } }));
import { chapterLibraryUpdate, ensureNovelLibrary, recordNovelChapter } from "./library";
describe("chapter-only library updates", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.novel.mockResolvedValue({ title: "Example", totalChapters: 500, status: "ongoing" }); mocks.update.mockResolvedValue({ _id: "entry" }); });
  it("marks chapter 200 active using an atomic maximum, preserving later progress", () => {
    expect(chapterLibraryUpdate(200)).toEqual({ $max: { progress_current: 200 }, $set: { status: "Active", last_updated: expect.any(Date) } });
    expect(chapterLibraryUpdate(50).$max).toEqual({ progress_current: 50 });
  });
  it.each([0,-1,1.5,NaN,Infinity])("rejects invalid hosted chapter %s", n => expect(() => chapterLibraryUpdate(n)).toThrow());
  it("creates one actual Chronicle library entry without replacing manual progress", async () => {
    await ensureNovelLibrary("user", "example");
    const [filter, update, options] = mocks.update.mock.calls[0];
    expect(filter).toEqual({ user_id: "user", hosted_novel_slug: "example" });
    expect(update.$setOnInsert).toMatchObject({ media_type: "Light Novel", status: "Planned", progress_current: 0, dedupe_key: "hosted:example" });
    expect(update.$set).toBeUndefined(); expect(options.upsert).toBe(true);
  });
  it("recovers concurrent first-read upsert races", async () => {
    mocks.update.mockRejectedValueOnce({ code: 11000 }); mocks.find.mockResolvedValue({ _id: "winner" });
    expect(await ensureNovelLibrary("user", "example")).toEqual({ _id: "winner" });
  });
  it("updates only the authenticated user's hosted entry", async () => {
    await recordNovelChapter("user-a", "example", 200);
    expect(mocks.update.mock.calls[1][0]).toEqual({ user_id: "user-a", hosted_novel_slug: "example" });
    expect(mocks.update.mock.calls[1][1]).not.toHaveProperty("currentScrollPosition");
  });
});
