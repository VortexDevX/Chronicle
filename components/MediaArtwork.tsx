"use client";

import type { CSSProperties } from "react";
import type { MediaItem } from "@/types/media";
import { useMediaCover } from "@/hooks/useMediaCover";

export function MediaArtwork({
  media,
  className = "",
  priority = false,
}: {
  media: MediaItem;
  className?: string;
  priority?: boolean;
}) {
  const { coverUrl, loading } = useMediaCover(media);
  const style = {
    "--art-color": media.status === "Completed" ? "#66d19e" : "#ff6b5f",
    ...(coverUrl ? { backgroundImage: `url("${coverUrl}")` } : {}),
  } as CSSProperties;

  return (
    <span
      className={`media-artwork ${coverUrl ? "has-cover" : ""} ${loading ? "is-loading" : ""} ${className}`}
      style={style}
      aria-hidden="true"
      data-priority={priority ? "true" : "false"}
    >
      {!coverUrl && <span>{media.title.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}
