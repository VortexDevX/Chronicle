"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaItem } from "@/types/media";
import {
  getMediaCover,
  retryMediaCover,
  type MediaCoverRequest,
} from "@/store/coverCache";

type CoverState = {
  key: string;
  url: string;
  loading: boolean;
};

function getIdentity(media: MediaItem): string {
  const title = media.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (media.media_type === "Manhwa") return `manhwa:${media.mangadex_id || title}`;
  if (media.media_type === "Anime" || media.media_type === "Donghua") {
    return `anime:${media.anilist_id || title}`;
  }
  return `${media.media_type}:${title}`;
}

export function useMediaCover(media: MediaItem, enabled = true) {
  const identity = getIdentity(media);
  const customCover = media.custom_cover_url || "";
  const lookupMedia = useMemo<MediaCoverRequest>(() => ({
    title: media.title,
    media_type: media.media_type,
    mangadex_id: media.mangadex_id,
    anilist_id: media.anilist_id,
  }), [media.title, media.media_type, media.mangadex_id, media.anilist_id]);
  const [state, setState] = useState<CoverState>({
    key: identity,
    url: customCover,
    loading: !customCover,
  });

  useEffect(() => {
    let current = true;
    setState({ key: identity, url: customCover, loading: enabled && !customCover });

    if (enabled && !customCover) {
      void getMediaCover(lookupMedia).then((url) => {
        if (current) setState({ key: identity, url: url || "", loading: false });
      });
    }

    return () => {
      current = false;
    };
  }, [identity, customCover, lookupMedia, enabled]);

  const retry = useCallback(async () => {
    setState((current) => ({ key: identity, url: current.key === identity ? current.url : "", loading: true }));
    const url = await retryMediaCover(lookupMedia);
    setState({ key: identity, url: url || "", loading: false });
    return url;
  }, [identity, lookupMedia]);

  const visibleState = useMemo(
    () => state.key === identity
      ? state
      : { key: identity, url: customCover, loading: !customCover },
    [state, identity, customCover],
  );

  return {
    coverUrl: visibleState.url,
    loading: visibleState.loading,
    retry,
  };
}
