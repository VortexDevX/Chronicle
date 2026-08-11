import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/types/media";
import { MediaCard } from "./MediaCard";

const baseMedia: MediaItem = {
  _id: "media-1",
  title: "The Greatest Estate Developer",
  media_type: "Manhwa",
  status: "Active",
  progress_current: 42,
  progress_total: 100,
  last_updated: "2026-08-10T12:00:00.000Z",
  custom_cover_url: "https://images.example.com/cover.jpg",
};
const trackerLabel = `Open tracker for ${baseMedia.title}`;
const logLabel = `Log next for ${baseMedia.title}`;
const missingTrackerLabel = `No tracker link for ${baseMedia.title}`;

describe("MediaCard tracker actions", () => {
  it("shows a safe tracker link beside Log next in grid mode", () => {
    const markup = renderToStaticMarkup(
      <MediaCard
        m={{ ...baseMedia, tracker_url: "https://tracker.example.com/series/estate" }}
        onIncrement={() => {}}
      />,
    );

    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('class="media-card-poster-actions"');
    expect(markup).toContain('href="https://tracker.example.com/series/estate"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain(`aria-label="${trackerLabel}"`);
    expect(markup).toContain(`aria-label="${logLabel}"`);
    expect(markup.indexOf(trackerLabel)).toBeLessThan(markup.indexOf(logLabel));
  });

  it("keeps the tracker available when progress cannot be logged", () => {
    const markup = renderToStaticMarkup(
      <MediaCard
        m={{
          ...baseMedia,
          status: "Completed",
          tracker_url: "https://tracker.example.com/series/estate",
        }}
      />,
    );

    expect(markup).toContain(`aria-label="${trackerLabel}"`);
    expect(markup).not.toContain(`aria-label="${logLabel}"`);
  });

  it("omits unsafe tracker links without hiding Log next", () => {
    const markup = renderToStaticMarkup(
      <MediaCard
        m={{ ...baseMedia, tracker_url: "http://localhost:3000/private" }}
        onIncrement={() => {}}
      />,
    );

    expect(markup).not.toContain(trackerLabel);
    expect(markup).not.toContain('href="http://localhost:3000/private"');
    expect(markup).toContain(`aria-label="${logLabel}"`);
  });

  it("preserves the disabled tracker placeholder in list mode", () => {
    const markup = renderToStaticMarkup(
      <MediaCard m={{ ...baseMedia, tracker_url: null }} mode="list" />,
    );

    expect(markup).toContain(`aria-label="${missingTrackerLabel}"`);
    expect(markup).toContain('title="No tracker link"');
  });
});
