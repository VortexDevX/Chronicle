"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
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
  const artworkRef = useRef<HTMLSpanElement>(null);
  const retriedCover = useRef(false);
  const [inRange, setInRange] = useState(priority);
  const [failedUrl, setFailedUrl] = useState("");
  const [retryToken, setRetryToken] = useState("");
  const { coverUrl, loading, retry } = useMediaCover(media, inRange || priority);
  const identity = `${media._id}:${media.custom_cover_url || ""}`;

  useEffect(() => {
    if (priority) {
      setInRange(true);
      return;
    }

    const element = artworkRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInRange(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInRange(true);
        observer.disconnect();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    retriedCover.current = false;
    setFailedUrl("");
    setRetryToken("");
  }, [identity]);

  const style = {
    "--art-color": media.status === "Completed" ? "#66d19e" : "#ff6b5f",
  } as CSSProperties;
  const imageUrl = retryToken
    ? `${coverUrl}${coverUrl.includes("?") ? "&" : "?"}retry=${retryToken}`
    : coverUrl;
  const showImage = Boolean(coverUrl) && failedUrl !== imageUrl;
  const showPlaceholder = !showImage;
  const eager = priority || inRange;

  return (
    <span
      ref={artworkRef}
      className={`media-artwork ${showImage ? "has-cover" : ""} ${loading ? "is-loading" : ""} ${className}`}
      style={style}
      aria-hidden="true"
      data-priority={priority ? "true" : "false"}
    >
      {showImage && (
        <Image
          key={imageUrl}
          src={imageUrl}
          alt=""
          fill
          unoptimized
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          sizes="(max-width: 640px) 44vw, (max-width: 1180px) 30vw, 220px"
          className="media-artwork-image"
          onError={() => {
            setFailedUrl(imageUrl);
            if (!retriedCover.current) {
              retriedCover.current = true;
              void retry().then((nextUrl) => {
                if (nextUrl && nextUrl === coverUrl) {
                  setFailedUrl("");
                  setRetryToken(String(Date.now()));
                }
              });
            }
          }}
        />
      )}
      {showPlaceholder && (
        <span>{media.title.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
