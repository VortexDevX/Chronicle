"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "@/types/media";
import {
  getCachedCover,
  queueCoverFetch,
  retryCoverFetch,
  subscribeCover,
} from "@/store/coverCache";

function coverIdentity(media: MediaItem) {
  if (media.mangadex_id) return `md-${media.mangadex_id}`;
  if (media.simkl_id) return `simkl-${media.simkl_id}`;
  return media.title;
}

export function useMediaCover(media: MediaItem) {
  const [coverUrl, setCoverUrl] = useState(media.custom_cover_url || "");
  const [loading, setLoading] = useState(!media.custom_cover_url);

  const requestCover = useCallback(
    (force = false) => {
      if (media.custom_cover_url) {
        setCoverUrl(media.custom_cover_url);
        setLoading(false);
        return () => {};
      }

      const supportsLookup =
        media.media_type === "Anime" ||
        media.media_type === "Donghua" ||
        (media.media_type === "Manhwa" && Boolean(media.mangadex_id));
      if (!supportsLookup) {
        setCoverUrl("");
        setLoading(false);
        return () => {};
      }

      const cacheKey = coverIdentity(media);
      if (force) {
        setLoading(true);
        retryCoverFetch(
          media.title,
          media._id,
          media.mangadex_id || undefined,
          media.simkl_id || undefined,
        );
      } else {
        const cached = getCachedCover(cacheKey);
        if (cached !== undefined) {
          setCoverUrl(cached || "");
          setLoading(false);
          return () => {};
        }
        setLoading(true);
        queueCoverFetch(
          media.title,
          media._id,
          media.mangadex_id || undefined,
          media.simkl_id || undefined,
        );
      }

      return subscribeCover(cacheKey, (url) => {
        setCoverUrl(url || "");
        setLoading(false);
      });
    },
    [media],
  );

  useEffect(() => requestCover(false), [requestCover]);

  return {
    coverUrl,
    loading,
    retry: () => requestCover(true),
  };
}
