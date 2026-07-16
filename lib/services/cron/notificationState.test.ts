import { describe, expect, it } from "vitest";
import {
  getNotificationBaseline,
  shouldNotifyProgress,
} from "./notificationState";

describe("notification progress state", () => {
  it("never moves behind manual progress or backwards", () => {
    expect(
      getNotificationBaseline({
        progressCurrent: 111,
        latestRemoteProgress: 111,
        lastNotifiedProgress: 110,
      }),
    ).toBe(111);

    expect(
      getNotificationBaseline({
        progressCurrent: 109,
        latestRemoteProgress: 113,
        lastNotifiedProgress: 112,
      }),
    ).toBe(112);
  });

  it("uses stored remote progress only for missing legacy state", () => {
    const legacyBaseline = getNotificationBaseline({
      progressCurrent: 111,
      latestRemoteProgress: 112,
      lastNotifiedProgress: undefined,
    });
    expect(shouldNotifyProgress(112, legacyBaseline)).toBe(false);
    expect(shouldNotifyProgress(113, legacyBaseline)).toBe(true);

    const failedSendBaseline = getNotificationBaseline({
      progressCurrent: 111,
      latestRemoteProgress: 113,
      lastNotifiedProgress: 112,
    });
    expect(failedSendBaseline).toBe(112);
    expect(shouldNotifyProgress(113, failedSendBaseline)).toBe(true);
  });
});
