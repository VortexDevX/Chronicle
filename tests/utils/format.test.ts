import { describe, it, expect } from "vitest";

// We can't use the DOM-dependent escapeHtml in node tests,
// but we can test the pure functions.

// Import only the pure functions (non-DOM)
import {
  relativeTime,
  daysSince,
  progressLabel,
  dateStamp,
  slugType,
} from "../../src/utils/format";

describe("relativeTime", () => {
  it("returns 'just now' for very recent dates", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(relativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("returns weeks ago", () => {
    const twoWeeksAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(relativeTime(twoWeeksAgo)).toBe("2w ago");
  });
});

describe("daysSince", () => {
  it("returns 0 for today", () => {
    expect(daysSince(new Date().toISOString())).toBe(0);
  });

  it("returns correct days for a past date", () => {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(daysSince(sevenDaysAgo)).toBe(7);
  });
});

describe("progressLabel", () => {
  it("returns 'ep' for Anime", () => {
    expect(progressLabel("Anime")).toBe("ep");
  });
  it("returns 'ep' for Donghua", () => {
    expect(progressLabel("Donghua")).toBe("ep");
  });
  it("returns 'ch' for Manhwa", () => {
    expect(progressLabel("Manhwa")).toBe("ch");
  });
  it("returns 'ch' for Light Novel", () => {
    expect(progressLabel("Light Novel")).toBe("ch");
  });
});

describe("dateStamp", () => {
  it("returns ISO date format YYYY-MM-DD", () => {
    const stamp = dateStamp();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("slugType", () => {
  it("converts 'Light Novel' to 'light-novel'", () => {
    expect(slugType("Light Novel")).toBe("light-novel");
  });
  it("converts 'Anime' to 'anime'", () => {
    expect(slugType("Anime")).toBe("anime");
  });
});
