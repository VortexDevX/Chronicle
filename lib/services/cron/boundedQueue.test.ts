import { describe, expect, it } from "vitest";
import { runBoundedQueue } from "@/lib/services/cron/boundedQueue";

describe("bounded queue", () => {
  it("processes every item with bounded concurrency", async () => {
    const seen: number[] = [];
    let active = 0;
    let maxActive = 0;

    await runBoundedQueue([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(item);
      active -= 1;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("uses at least one worker for invalid concurrency values", async () => {
    const seen: number[] = [];

    await runBoundedQueue([1, 2], 0, async (item) => {
      seen.push(item);
    });

    expect(seen).toEqual([1, 2]);
  });
});
