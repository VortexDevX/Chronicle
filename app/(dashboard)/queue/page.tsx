"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Search, Plus, ListTodo } from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";

export default function QueuePage() {
  const media = useMediaStore((state) => state.media);
  const loading = useMediaStore((state) => state.loading);
  const hasMore = useMediaStore((state) => state.hasMore);
  const page = useMediaStore((state) => state.page);
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setMedia = useMediaStore((state) => state.setMedia);
  const setLoading = useMediaStore((state) => state.setLoading);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const updateFilters = useMediaStore((state) => state.updateFilters);
  const openModal = useMediaStore((state) => state.openModal);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortBy, setSortBy] = useState("last_updated");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMedia = useCallback(async (pg = 1, replace = true) => {
    if (replace) resetCoverQueue();
    setLoading(true, pg > 1);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "24", sort_by: sortBy, status: "Planned" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterType) params.set("media_type", filterType);
      const res = await fetch(`/api/media?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setMedia(json.data.items, json.data.total, json.data.has_more, replace);
      updateFilters({ page: pg });
    } catch {}
    finally { setLoading(false); }
  }, [debouncedSearch, filterType, sortBy, setMedia, setLoading, updateFilters]);

  useEffect(() => {
    setActiveRoute("queue");
    resetCoverQueue();
    setMedia([], 0, false, true);
    loadCoverCache();
  }, [setActiveRoute, setMedia]);

  useEffect(() => {
    fetchMedia(1, true);
  }, [fetchMedia, mediaRev]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      fetchMedia(1, true);
    } catch {}
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) fetchMedia(page + 1, false);
  };

  return (
    <>
      <div className="controls">
        <div className="controls-toolbar">
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Search queue..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          </div>
        </div>
      </div>

      {loading && media.length === 0 ? (
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
          <div className="empty-state-icon"><ListTodo size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
          <h3>Your queue is empty</h3>
          <p>No planned entries found.</p>
        </div>
      ) : (
        <div className="grid">
          {media.map((m) => (
            <MediaCard key={m._id} m={m} onEdit={openModal} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="load-more-wrap">
          <button className="btn-ghost" onClick={handleLoadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
      
      <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
        <Plus size={28} strokeWidth={3} />
      </button>
    </>
  );
}
