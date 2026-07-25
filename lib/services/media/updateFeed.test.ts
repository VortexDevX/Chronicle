import { describe, expect, it } from "vitest";
import { telegramUpdateState, unreadDelta } from "./updateFeed";

describe("update feed progress state", () => {
  it("classifies a release delivered through Telegram", () => {
    expect(telegramUpdateState({
      progress_current: 10,
      latest_remote_progress: 12,
      last_notified_progress: 12,
    })).toBe("fully_notified");
  });

  it("distinguishes a newer pending release from an older delivered one", () => {
    expect(telegramUpdateState({
      progress_current: 10,
      latest_remote_progress: 12,
      last_notified_progress: 11,
    })).toBe("previously_notified");
  });

  it("reports unread progress that has not been delivered", () => {
    expect(telegramUpdateState({
      progress_current: 10,
      latest_remote_progress: 12,
      last_notified_progress: 10,
    })).toBe("not_notified");
  });

  it("preserves decimal unread amounts without floating-point noise", () => {
    expect(unreadDelta({
      progress_current: 112,
      latest_remote_progress: 112.6,
      last_notified_progress: 112.6,
    })).toBe(0.6);
  });
});
