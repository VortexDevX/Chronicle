"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Search, Plus, ListTodo, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { useFeedback } from "@/components/FeedbackProvider";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useMediaList } from "@/hooks/useMediaList";
import { MediaViewMode, MediaViewToggle } from "@/components/MediaViewToggle";

const QUEUE_VIEW_KEY = "chronicle:queue-view:v1";

export default function QueuePage() {
  const media = useMediaStore((state) => state.media);
  const loading = useMediaStore((state) => state.loading);
  const loadingMore = useMediaStore((state) => state.loadingMore);
  const hasMore = useMediaStore((state) => state.hasMore);
  const page = useMediaStore((state) => state.page);
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setMedia = useMediaStore((state) => state.setMedia);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const { toast, confirm } = useFeedback();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortBy, setSortBy] = useState("last_updated");
  const [viewMode, setViewMode] = useState<MediaViewMode>("grid");
  const query = useMemo(() => {
    const params = new URLSearchParams({ sort_by: sortBy, status: "Planned" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterType) params.set("media_type", filterType);
    return params.toString();
  }, [debouncedSearch, filterType, sortBy]);
  const { fetchMedia, loadError } = useMediaList(query, "Queue could not load");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setActiveRoute("queue");
    resetCoverQueue();
    setMedia([], 0, false, true);
    loadCoverCache();
  }, [setActiveRoute, setMedia]);

  useEffect(() => {
    const saved = window.localStorage.getItem(QUEUE_VIEW_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const updateViewMode = (mode: MediaViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(QUEUE_VIEW_KEY, mode);
  };

  useEffect(() => {
    fetchMedia(1, true);
  }, [fetchMedia, mediaRev]);

  const handleDelete = async (id: string) => {
    const approved = await confirm({
      title: "Delete queued entry?",
      message: "This removes the entry from Chronicle, not only from Queue.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!approved) return;
    try {
      await apiRequest(`/api/media?id=${id}`, { method: "DELETE" });
      toast("Entry deleted", "success");
      fetchMedia(1, true);
    } catch (err) {
      toast(getErrorMessage(err, "Delete failed"), "error");
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) fetchMedia(page + 1, false);
  };

  const searchPending = search !== debouncedSearch;
  const isRefining = (loading && media.length > 0 && !loadingMore) || searchPending;

  return (
    <>
      <div className="controls">
        <div className="controls-toolbar">
          <div className="search-wrapper" data-loading={searchPending ? "true" : "false"}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Search queue..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {searchPending && <span className="search-loading-dot" aria-hidden="true" />}
          </div>
          
          <div className="controls-filters">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="Anime">Anime</option>
              <option value="Manhwa">Manhwa</option>
              <option value="Donghua">Donghua</option>
              <option value="Light Novel">Light Novel</option>
            </select>
            
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="last_updated">Recently Added</option>
              <option value="title">Alphabetical (A-Z)</option>
            </select>
            <MediaViewToggle value={viewMode} onChange={updateViewMode} label="Queue view" />
          </div>
        </div>
      </div>

      {isRefining && (
        <div className="results-loading-strip">
          <span className="spinner" /> Updating results...
        </div>
      )}

      {loadError && media.length === 0 ? (
        <div className="state-panel state-error">
          <RefreshCw size={22} />
          <h2>Queue unavailable.</h2>
          <p>{loadError}</p>
          <button className="btn-primary" onClick={() => fetchMedia(1, true)}>Try again</button>
        </div>
      ) : loading && media.length === 0 ? (
        <div className="grid media-grid">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skel-poster skeleton" />
              <div className="skel-body">
                <div className="skel-title-row">
                  <div className="skel-line skel-title skeleton" />
                  <div className="skel-rating skeleton" />
                </div>
                <div className="skel-line skel-meta skeleton" />
                <div className="skel-progress-row">
                  <div className="skel-line skel-progress-num skeleton" />
                  <div className="skel-line skel-progress-unit skeleton" />
                </div>
                <div className="skel-line skel-progress-bar skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ListTodo size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
          <h3>Your queue is empty</h3>
          <p>No planned entries found.</p>
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid media-grid" : "library-media-list"}>
          {media.map((m) => (
            <MediaCard key={m._id} m={m} mode={viewMode} onEdit={openModal} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="load-more-wrap">
          <button className="btn-ghost" onClick={handleLoadMore} disabled={loading}>
            {loading ? <><span className="spinner" /> Loading...</> : "Load more"}
          </button>
        </div>
      )}

      <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
        <Plus size={28} strokeWidth={3} />
      </button>
    </>
  );
}
