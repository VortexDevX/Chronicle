import { expect, it } from "vitest";
import { useMediaStore } from "./mediaStore";
import type { MediaItem } from "@/types/media";

it("clears private collection and open panels when a session ends", () => {
  const item: MediaItem = { _id: "private", title: "Private story", media_type: "Anime", status: "Active", progress_current: 1, progress_total: 12, last_updated: "2026-10-31" };
  useMediaStore.setState({ media: [item], total: 1, detailsMedia: item, modalOpen: true, modalMedia: item, settingsOpen: true, selectedIds: new Set([item._id]) });
  useMediaStore.getState().setAuth("unauthenticated");
  expect(useMediaStore.getState()).toMatchObject({ media: [], total: 0, detailsMedia: null, modalOpen: false, modalMedia: null, settingsOpen: false });
  expect(useMediaStore.getState().selectedIds.size).toBe(0);
});
