"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { resetCoverQueue } from "@/store/coverCache";
import { useMediaStore } from "@/store/mediaStore";
import type { MediaItem } from "@/types/media";

type MediaListPage = {
  items: MediaItem[];
  total: number;
  has_more: boolean;
};

export function useMediaList(query: string, errorMessage: string) {
  const setMedia = useMediaStore((state) => state.setMedia);
  const setLoading = useMediaStore((state) => state.setLoading);
  const updateFilters = useMediaStore((state) => state.updateFilters);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const [loadError, setLoadError] = useState("");

  const fetchMedia = useCallback(async (page = 1, replace = true) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    abortRef.current = controller;

    if (replace) resetCoverQueue();
    setLoading(true, page > 1);
    setLoadError("");

    try {
      const separator = query ? "&" : "";
      const data = await apiRequest<MediaListPage>(
        `/api/media?page=${page}&limit=24${separator}${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!controller.signal.aborted && requestRef.current === requestId) {
        setMedia(data.items, data.total, data.has_more, replace);
        updateFilters({ page });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(getErrorMessage(error, errorMessage));
    } finally {
      if (!controller.signal.aborted && requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [errorMessage, query, setLoading, setMedia, updateFilters]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { fetchMedia, loadError };
}
