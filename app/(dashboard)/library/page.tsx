"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Search, Plus, Book, Grid2X2, List, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { useMediaList } from "@/hooks/useMediaList";

const LIBRARY_VIEW_KEY = "chronicle:library-view:v1";

export default function LibraryPage() {
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
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState("last_updated");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const query = useMemo(() => {
    const params = new URLSearchParams({ sort_by: sortBy });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterType) params.set("media_type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    return params.toString();
  }, [debouncedSearch, filterStatus, filterType, sortBy]);
  const { fetchMedia, loadError } = useMediaList(query, "Library could not load");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const saved = window.localStorage.getItem(LIBRARY_VIEW_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const updateViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    window.localStorage.setItem(LIBRARY_VIEW_KEY, mode);
  };

  useEffect(() => {
    setActiveRoute("library");
    resetCoverQueue();
    setMedia([], 0, false, true);
    loadCoverCache();
  }, [setActiveRoute, setMedia]);

  useEffect(() => {
    fetchMedia(1, true);
  }, [fetchMedia, mediaRev]);

  const handleIncrement = async (id: string) => {
    const item = media.find((m) => m._id === id);
    if (!item || pendingIds.has(id)) return;
    setPendingIds(prev => new Set(prev).add(id));
    try {
      const nextProgress = item.progress_total > 0
        ? Math.min(item.progress_total, item.progress_current + 1)
        : item.progress_current + 1;
      if (nextProgress === item.progress_current) {
        toast(`${item.title} is already complete`, "info");
        return;
      }
      await apiRequest(`/api/media?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: nextProgress }),
      });
      toast(`${item.title} progress updated`, "success");
      fetchMedia(1, true);
    } catch (err) {
      toast(getErrorMessage(err, "Progress update failed"), "error");
    }
    finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    const item = media.find((candidate) => candidate._id === id);
    const approved = await confirm({
      title: "Delete entry?",
      message: item
        ? `${item.title} and its seven-day activity will be removed.`
        : "This entry and its seven-day activity will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!approved) return;
    setPendingIds(prev => new Set(prev).add(id));
    try {
      await apiRequest(`/api/media?id=${id}`, { method: "DELETE" });
      toast("Entry deleted", "success");
      fetchMedia(1, true);
    } catch (err) {
      toast(getErrorMessage(err, "Delete failed"), "error");
    }
    finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
            <input type="text" placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
            
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Planned">Planned</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Dropped">Dropped</option>
            </select>
            
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="last_updated">Recent Activity</option>
              <option value="title">Alphabetical (A-Z)</option>
              <option value="rating">Top Rated</option>
              <option value="progress">Highest Progress</option>
            </select>
            <div className="view-toggle" aria-label="Library view">
              <button
                className={viewMode === "grid" ? "is-active" : ""}
                onClick={() => updateViewMode("grid")}
                aria-label="Grid view"
              >
                <Grid2X2 size={16} />
              </button>
              <button
                className={viewMode === "list" ? "is-active" : ""}
                onClick={() => updateViewMode("list")}
                aria-label="List view"
              >
                <List size={17} />
              </button>
            </div>
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
          <h2>Library unavailable.</h2>
          <p>{loadError}</p>
          <button className="btn-primary" onClick={() => fetchMedia(1, true)}>Try again</button>
        </div>
      ) : loading && media.length === 0 ? (
        <div className="grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="card skeleton-card">
              <div className="card-poster">
                <div className="card-thumb skeleton"></div>
                <div className="card-poster-info">
                  <div className="skeleton skeleton-line skeleton-line-sm"></div>
                  <div className="skeleton skeleton-line skeleton-line-lg"></div>
                  <div className="skeleton skeleton-line skeleton-line-xs"></div>
                </div>
              </div>
              <div className="card-body">
                <div className="skeleton skeleton-line skeleton-line-md"></div>
                <div className="skeleton skeleton-progress"></div>
              </div>
            </div>
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Book size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
          <h3>Your chronicle is empty</h3>
          <p>Start tracking your first anime, manhwa, or light novel.</p>
          <button className="btn-primary" onClick={() => openModal(null)}>+ Add Your First Entry</button>
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid media-grid" : "library-media-list"}>
          {media.map((m) => (
            <MediaCard key={m._id} m={m} mode={viewMode} onEdit={openModal} onIncrement={handleIncrement} onDelete={handleDelete} />
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
