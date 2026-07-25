import { describe, expect, it } from "vitest";
import {
  ACTIVITY_RETENTION_SECONDS,
  ProgressActivity,
} from "./ProgressActivity";

describe("ProgressActivity retention", () => {
  it("configures a seven-day TTL and user/media time indexes", () => {
    expect(ACTIVITY_RETENTION_SECONDS).toBe(604800);
    const indexes = ProgressActivity.schema.indexes();
    expect(indexes).toContainEqual([
      { occurred_at: 1 },
      expect.objectContaining({ expireAfterSeconds: 604800 }),
    ]);
    expect(indexes).toContainEqual([
      { user_id: 1, occurred_at: -1 },
      expect.any(Object),
    ]);
    expect(indexes).toContainEqual([
      { media_id: 1, occurred_at: -1 },
      expect.any(Object),
    ]);
  });
});
