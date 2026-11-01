"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Search, Book, Grid2X2, List, RefreshCw, ImageOff, ChevronDown, ChevronUp, CheckSquare, Trash2, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadCoverCache } from "@/store/coverCache";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { useMediaList } from "@/hooks/useMediaList";

const LIBRARY_VIEW_KEY = "chronicle:library-view:v1";

type MissingMangaDexEntry = { _id: string; title: string };

export default function LibraryPage() {
  const media = useMediaStore((state) => state.media);
  const total = useMediaStore((state) => state.total);
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
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [missingMangaDex, setMissingMangaDex] = useState<{
    items: MissingMangaDexEntry[];
    total: number;
  }>({ items: [], total: 0 });
  const [showMissingMangaDex, setShowMissingMangaDex] = useState(false);
  const query = useMemo(() => {
    const params = new URLSearchParams({ sort_by: sortBy });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterType) params.set("media_type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    return params.toString();
  }, [debouncedSearch, filterStatus, filterType, sortBy]);
  const { fetchMedia, loadError } = useMediaList(query, "Library could not load");

  const uniqueMedia = useMemo(() => {
    const seen = new Set<string>();
    return media.filter((m) => {
      if (!m || !m._id || seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    });
  }, [media]);

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
    setMedia([], 0, false, true);
    loadCoverCache();
  }, [setActiveRoute, setMedia]);

  useEffect(() => {
    fetchMedia(1, true);
  }, [fetchMedia, mediaRev]);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: MissingMangaDexEntry[]; total: number }>(
      "/api/media/missing-mangadex",
      { cache: "no-store" },
    )
      .then((result) => {
        if (active) setMissingMangaDex(result);
      })
      .catch(() => {
        if (active) setMissingMangaDex({ items: [], total: 0 });
      });
    return () => {
      active = false;
    };
  }, [mediaRev]);

  const handleIncrement = async (id: string) => {
    const item = media.find((m) => m._id === id);
    if (!item || pendingIds.has(id)) throw new Error("This entry cannot be updated yet. Try again.");
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
      fetchMedia(1, true);
    } catch (err) {
      toast(getErrorMessage(err, "Progress update failed"), "error");
      throw err;
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [query]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (selectedIds.size === uniqueMedia.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(uniqueMedia.map((m) => m._id)));
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0 || isDeletingBulk) return;

    const approved = await confirm({
      title: `Delete ${count} ${count === 1 ? "entry" : "entries"}?`,
      message: `${count} ${count === 1 ? "entry" : "entries"} and their seven-day activity will be permanently removed.`,
      confirmLabel: `Delete ${count}`,
      danger: true,
    });
    if (!approved) return;

    setIsDeletingBulk(true);
    try {
      const res = await apiRequest<{ deleted: number }>("/api/media?bulk_delete=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      toast(`Deleted ${res.deleted ?? count} ${res.deleted === 1 ? "entry" : "entries"}`, "success");
      setIsSelectMode(false);
      setSelectedIds(new Set());
      fetchMedia(1, true);
    } catch (err) {
      toast(getErrorMessage(err, "Bulk delete failed"), "error");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) fetchMedia(page + 1, false);
  };

  const searchPending = search !== debouncedSearch;
  const isRefining = (loading && media.length > 0 && !loadingMore) || searchPending;
  const hasFilters = Boolean(search || filterType || filterStatus);
  const resetFilters = () => { setSearch(""); setDebouncedSearch(""); setFilterType(""); setFilterStatus(""); };

  return (
    <>
      <div className="page-intro library-intro"><div><span className="section-eyebrow">Your personal collection</span><h2>Library<span className="title-stop">.</span></h2></div><p>Watch. Read. Keep your place.</p></div>
      {missingMangaDex.total > 0 && (
        <aside className="cover-audit-notice" role="status">
          <div className="cover-audit-copy">
            <ImageOff size={18} aria-hidden="true" />
            <p>
              <strong>
                {missingMangaDex.total} Manhwa {missingMangaDex.total === 1 ? "entry is" : "entries are"} missing a MangaDex ID.
              </strong>
              <span>We’ll search MangaDex by title for covers; adding an ID makes matching exact.</span>
            </p>
          </div>
          <button
            className="cover-audit-toggle"
            onClick={() => setShowMissingMangaDex((shown) => !shown)}
            aria-expanded={showMissingMangaDex}
          >
            {showMissingMangaDex ? "Hide entries" : "View entries"}
            {showMissingMangaDex ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showMissingMangaDex && (
            <ul className="cover-audit-list">
              {missingMangaDex.items.map((item) => (
                <li key={item._id}>
                  <button
                    onClick={() => {
                      setFilterType("Manhwa");
                      setFilterStatus("");
                      setSearch(item.title);
                      setShowMissingMangaDex(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    title={`Find ${item.title} in your library`}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
              {missingMangaDex.total > missingMangaDex.items.length && (
                <li className="cover-audit-overflow">
                  And {missingMangaDex.total - missingMangaDex.items.length} more entries
                </li>
              )}
            </ul>
          )}
        </aside>
      )}
      <div className="library-toolbar">
        <div className="catalogue-formats" role="group" aria-label="Browse by format">
          {["", "Anime", "Manhwa", "Donghua", "Light Novel"].map((format) => <button key={format} aria-pressed={filterType === format} onClick={() => setFilterType(format)}>{format || "All formats"}</button>)}
        </div>
        <div className="library-search-row">
          <div className="search-wrapper" data-loading={searchPending ? "true" : "false"}>
            <Search size={18} className="search-icon" />
            <input type="search" aria-label="Search your library" placeholder="Find your next chapter…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {searchPending && <span className="search-loading-dot" aria-hidden="true" />}
          </div>
          <details className="library-filter-disclosure">
            <summary><SlidersHorizontal size={17} /> Filters{(filterType || filterStatus) && <span className="filter-active-dot" />}</summary>
            <div className="library-filter-panel">
              <label>Format<select aria-label="Format" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All formats</option><option>Anime</option><option>Manhwa</option><option>Donghua</option><option>Light Novel</option>
              </select></label>
              <label>Status<select aria-label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option><option>Active</option><option>Planned</option><option>On Hold</option><option>Completed</option><option>Dropped</option>
              </select></label>
              <label>Sort by<select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="last_updated">Recent activity</option><option value="title">Alphabetical</option><option value="rating">Top rated</option><option value="progress">Highest progress</option>
              </select></label>
            </div>
          </details>
        </div>
        {(filterType || filterStatus) && <div className="active-filter-chips">
          {filterType && <button onClick={() => setFilterType("")}>{filterType}<X size={13} /><span className="sr-only">Remove format filter</span></button>}
          {filterStatus && <button onClick={() => setFilterStatus("")}>{filterStatus}<X size={13} /><span className="sr-only">Remove status filter</span></button>}
        </div>}
        <div className="library-action-row">
          <span className="collection-count" role="status">{loading && !media.length ? "Opening your collection…" : `${total} ${total === 1 ? "story" : "stories"}${hasFilters ? " found" : " in your library"}`}</span>
          <div className="library-view-actions">
            <div className="view-toggle" role="group" aria-label="Library view">
              <button className={viewMode === "grid" ? "is-active" : ""} onClick={() => updateViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"}><Grid2X2 size={18} /></button>
              <button className={viewMode === "list" ? "is-active" : ""} onClick={() => updateViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"}><List size={18} /></button>
            </div>
            {media.length > 0 && <button type="button" className={`library-select-toggle ${isSelectMode ? "is-active" : ""}`} onClick={() => { setIsSelectMode((prev) => !prev); setSelectedIds(new Set()); }}
              aria-label={isSelectMode ? "Cancel selection" : "Select multiple entries"} aria-pressed={isSelectMode}>
              <CheckSquare size={16} /><span>{isSelectMode ? "Cancel" : "Select"}</span>
            </button>}
          </div>
        </div>
      </div>

      {isSelectMode && uniqueMedia.length > 0 && (
        <div className="library-bulk-bar" role="toolbar" aria-label="Bulk actions">
          <div className="library-bulk-info">
            <span className="library-bulk-count">
              <strong>{selectedIds.size}</strong> of {uniqueMedia.length} shown selected
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleSelectAllToggle}
            >
              {selectedIds.size === uniqueMedia.length ? "Deselect shown" : "Select shown"}
            </button>
          </div>
          <div className="library-bulk-actions">
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={selectedIds.size === 0 || isDeletingBulk}
              onClick={handleBulkDelete}
            >
              {isDeletingBulk ? (
                <>
                  <span className="spinner" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={15} /> Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedIds(new Set());
              }}
              disabled={isDeletingBulk}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isRefining && (
        <div className="results-loading-strip" role="status">
          <span className="spinner" /> Updating results...
        </div>
      )}
      {loadError && media.length > 0 && <div className="partial-notice" role="alert"><span>{loadError}. Showing previous results.</span><button onClick={() => fetchMedia(1, true)}>Retry</button></div>}

      {loadError && media.length === 0 ? (
        <div className="state-panel state-error">
          <RefreshCw size={22} />
          <h2>Library unavailable.</h2>
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
          <div className="empty-state-icon"><Book size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
          <h3>{hasFilters ? "No matching stories" : "Your first chapter starts here."}</h3>
          <p>{hasFilters ? "Try another title or clear your filters." : "Add an anime, manhwa, donghua, or novel to start your collection."}</p>
          <button className="btn-primary" onClick={hasFilters ? resetFilters : () => openModal(null)}>{hasFilters ? "Clear search & filters" : "Add your first story"}</button>
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid media-grid" : "library-media-list"}>
          {uniqueMedia.map((m, index) => (
            <MediaCard
              key={m._id}
              m={m}
              mode={viewMode}
              priority={index < 8}
              position={index + 1}
              onEdit={openModal}
              onIncrement={handleIncrement}
              onDelete={handleDelete}
              selectable={isSelectMode}
              selected={selectedIds.has(m._id)}
              onToggleSelect={handleToggleSelect}
            />
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
      
    </>
  );
}
