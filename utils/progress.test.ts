import { describe, expect, it } from "vitest";
import { progressSummary, unreadDelta } from "./progress";
import type { MediaItem } from "@/types/media";

const item: MediaItem = { _id: "test", title: "Story", media_type: "Manhwa", status: "Active", progress_current: 42.125, progress_total: 0, latest_remote_progress: 44.625, last_updated: "2026-10-31" };

describe("story progress presentation", () => {
  it("keeps exact decimal unread differences without floating-point noise", () => {
    expect(unreadDelta(292.4, 289.1)).toBe(3.3);
    expect(unreadDelta(1e-7, 0)).toBe(1e-7);
  });
  it("preserves fractional manual progress and unread delta", () => {
    const p = progressSummary(item);
    expect(p.label).toBe("Ch. 42.125");
    expect(p.unread).toBe(2.5);
    expect(p.availability).toBe("2.5 chapters unread · latest 44.625");
  });
  it("does not call an unknown-total ongoing story 100% complete", () => {
    const p = progressSummary({ ...item, latest_remote_progress: 42.125 });
    expect(p.percent).toBeNull();
    expect(p.availability).toBe("Caught up to latest known release");
  });
  it("caps next progress at a known total", () => {
    const p = progressSummary({ ...item, progress_current: 42.125, progress_total: 42.5 });
    expect(p.next).toBe(42.5);
    expect(p.label).toBe("Ch. 42.125 / 42.5");
  });
  it("does not invent availability when a tracker has never checked", () => {
    const p = progressSummary({ ...item, latest_remote_progress: null });
    expect(p.availability).toBe("Total not yet known");
    expect(p.unread).toBe(0);
  });
});
