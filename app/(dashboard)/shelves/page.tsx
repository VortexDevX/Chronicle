"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import {
  ArrowLeft,
  Check,
  Edit2,
  FolderHeart,
  FolderPlus,
  Layers3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { Shelf, MediaItem, ShelfPreviewItem } from "@/types/media";
import { PageLoader } from "@/components/PageLoader";
import { useFeedback } from "@/components/FeedbackProvider";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { MediaViewMode, MediaViewToggle } from "@/components/MediaViewToggle";
import { MediaArtwork } from "@/components/MediaArtwork";

const SHELF_VIEW_KEY = "chronicle:shelf-view:v1";

const MEDIA_TYPES = ["All", "Anime", "Manhwa", "Manga", "Donghua", "Light Novel"] as const;

export default function ShelvesPage() {
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);

  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Shelf Drilldown State
  const [activeShelf, setActiveShelf] = useState<Shelf | null>(null);
  const [shelfMedia, setShelfMedia] = useState<MediaItem[]>([]);
  const [shelfLoading, setShelfLoading] = useState(false);
  const [shelfSearch, setShelfSearch] = useState("");
  const [shelfTypeFilter, setShelfTypeFilter] = useState("All");

  // Shelves Overview State
  const [overviewSearch, setOverviewSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "count" | "alpha">("recent");

  // Create / Edit Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);
  const [shelfNameInput, setShelfNameInput] = useState("");
  const [shelfDescInput, setShelfDescInput] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Quick Add Titles Modal State
  const [showAddTitlesModal, setShowAddTitlesModal] = useState(false);
  const [allLibraryMedia, setAllLibraryMedia] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedShelfMediaIds, setSelectedShelfMediaIds] = useState<Set<string>>(new Set());
  const [savingTitles, setSavingTitles] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<MediaViewMode>("grid");
  const { toast, confirm } = useFeedback();

  const fetchShelves = useCallback(async () => {
    setLoadError("");
    try {
      const data = await apiRequest<{ items?: Shelf[] }>("/api/shelves", {
        cache: "no-store",
      });
      setShelves(data.items || []);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Shelves could not load"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchShelfMedia = useCallback(
    async (shelfId: string) => {
      resetCoverQueue();
      setShelfLoading(true);
      try {
        const data = await apiRequest<{ items?: MediaItem[] }>(
          `/api/shelves?id=${shelfId}`,
          { cache: "no-store" },
        );
        const items = Array.isArray(data.items) ? data.items : [];
        setShelfMedia(items);
        setSelectedShelfMediaIds(new Set(items.map((m) => m._id)));
      } catch (err) {
        setShelfMedia([]);
        toast(getErrorMessage(err, "Shelf could not load"), "error");
      } finally {
        setShelfLoading(false);
      }
    },
    [toast],
  );

  const fetchLibraryForShelf = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const data = await apiRequest<{ items?: MediaItem[] }>("/api/media?limit=300", {
        cache: "no-store",
      });
      setAllLibraryMedia(Array.isArray(data.items) ? data.items : []);
    } catch {
      toast("Could not load library entries", "error");
    } finally {
      setLibraryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setActiveRoute("shelves");
    resetCoverQueue();
    loadCoverCache();
    fetchShelves();
  }, [fetchShelves, setActiveRoute, mediaRev]);

  useEffect(() => {
    if (activeShelf) {
      fetchShelfMedia(activeShelf._id);
    }
  }, [activeShelf, fetchShelfMedia]);

  useEffect(() => {
    const saved = window.localStorage.getItem(SHELF_VIEW_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const updateViewMode = (mode: MediaViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(SHELF_VIEW_KEY, mode);
  };

  const handleOpenCreate = () => {
    setEditingShelf(null);
    setShelfNameInput("");
    setShelfDescInput("");
    setShowCreateModal(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, shelf: Shelf) => {
    e.stopPropagation();
    setEditingShelf(shelf);
    setShelfNameInput(shelf.name);
    setShelfDescInput(shelf.description || "");
    setShowCreateModal(true);
  };

  const handleSaveShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = shelfNameInput.trim();
    if (!name) return;

    setFormSubmitting(true);
    try {
      if (editingShelf) {
        await apiRequest(`/api/shelves?id=${editingShelf._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: shelfDescInput.trim(),
          }),
        });
        toast("Shelf updated", "success");
        if (activeShelf?._id === editingShelf._id) {
          setActiveShelf((prev) =>
            prev ? { ...prev, name, description: shelfDescInput.trim() } : null,
          );
        }
      } else {
        await apiRequest("/api/shelves", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: shelfDescInput.trim(),
          }),
        });
        toast("Shelf created", "success");
      }
      setShowCreateModal(false);
      fetchShelves();
    } catch (err) {
      toast(getErrorMessage(err, "Could not save shelf"), "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteShelf = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const approved = await confirm({
      title: "Delete this shelf?",
      message: "Media entries will stay intact in your Library.",
      confirmLabel: "Delete Shelf",
      danger: true,
    });
    if (!approved) return;

    setDeleteLoading(id);
    try {
      await apiRequest(`/api/shelves?id=${id}`, { method: "DELETE" });
      if (activeShelf?._id === id) {
        setActiveShelf(null);
        setShelfMedia([]);
      }
      toast("Shelf deleted", "success");
      fetchShelves();
    } catch (err) {
      toast(getErrorMessage(err, "Could not delete shelf"), "error");
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleOpenAddTitles = () => {
    fetchLibraryForShelf();
    setShowAddTitlesModal(true);
  };

  const toggleTitleSelection = (id: string) => {
    setSelectedShelfMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTitlesToShelf = async () => {
    if (!activeShelf) return;
    setSavingTitles(true);
    const media_ids = Array.from(selectedShelfMediaIds);
    try {
      await apiRequest(`/api/shelves?id=${activeShelf._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_ids }),
      });
      toast("Shelf items updated", "success");
      setShowAddTitlesModal(false);
      fetchShelfMedia(activeShelf._id);
      fetchShelves();
    } catch (err) {
      toast(getErrorMessage(err, "Could not update shelf items"), "error");
    } finally {
      setSavingTitles(false);
    }
  };

  // Filtered & Sorted Shelves
  const filteredShelves = useMemo(() => {
    let list = [...shelves];
    if (overviewSearch.trim()) {
      const q = overviewSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q),
      );
    }
    if (sortBy === "count") {
      list.sort((a, b) => (b.item_count || 0) - (a.item_count || 0));
    } else if (sortBy === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [shelves, overviewSearch, sortBy]);

  // Filtered Media in Active Shelf
  const visibleShelfMedia = useMemo(() => {
    return shelfMedia.filter((item) => {
      const matchesSearch =
        !shelfSearch.trim() ||
        item.title.toLowerCase().includes(shelfSearch.toLowerCase());
      const matchesType =
        shelfTypeFilter === "All" || item.media_type === shelfTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [shelfMedia, shelfSearch, shelfTypeFilter]);

  // Library items in quick add modal
  const filteredLibraryItems = useMemo(() => {
    if (!librarySearch.trim()) return allLibraryMedia;
    const q = librarySearch.toLowerCase();
    return allLibraryMedia.filter((item) =>
      item.title.toLowerCase().includes(q),
    );
  }, [allLibraryMedia, librarySearch]);

  const totalCuratedCount = useMemo(() => {
    return shelves.reduce((acc, s) => acc + (s.item_count || 0), 0);
  }, [shelves]);

  if (loading) {
    return (
      <PageLoader
        label="Opening collections"
        detail="Loading curated shelves"
        compact
      />
    );
  }

  if (loadError && shelves.length === 0) {
    return (
      <div className="state-panel state-error">
        <h2>Shelves unavailable.</h2>
        <p>{loadError}</p>
        <button className="btn-primary" onClick={fetchShelves}>
          Try again
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------
  // ACTIVE SHELF DRILLDOWN VIEW
  // -------------------------------------------------------------
  if (activeShelf) {
    return (
      <div className="shelves-view">
        <div className="active-shelf-banner">
          <div className="active-shelf-topbar">
            <button
              className="shelf-back-btn"
              onClick={() => setActiveShelf(null)}
            >
              <ArrowLeft size={16} />
              <span>All Shelves</span>
            </button>

            <div className="active-shelf-actions">
              <button
                className="btn-secondary"
                onClick={(e) => handleOpenEdit(e, activeShelf)}
                title="Edit shelf name and description"
              >
                <Edit2 size={15} />
                <span>Edit Details</span>
              </button>
              <button
                className="btn-danger"
                onClick={(e) => handleDeleteShelf(e, activeShelf._id)}
                disabled={deleteLoading === activeShelf._id}
                title="Delete this shelf"
              >
                {deleteLoading === activeShelf._id ? (
                  <span className="spinner" />
                ) : (
                  <Trash2 size={15} />
                )}
                <span>Delete Shelf</span>
              </button>
            </div>
          </div>

          <div className="active-shelf-header-content">
            <div className="active-shelf-icon-badge">
              <Layers3 size={28} />
            </div>
            <div className="active-shelf-title-group">
              <div className="active-shelf-meta-row">
                <span className="active-shelf-pill">Curated Shelf</span>
                <span className="active-shelf-count-tag">
                  {shelfMedia.length} {shelfMedia.length === 1 ? "title" : "titles"}
                </span>
              </div>
              <h1 className="active-shelf-title">{activeShelf.name}</h1>
              {activeShelf.description && (
                <p className="active-shelf-description">
                  {activeShelf.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Shelf Toolbar: Filter, Search, View Mode, Add Titles */}
        <div className="shelf-toolbar">
          <div className="shelf-toolbar-left">
            <div className="shelf-search-input-wrap">
              <Search size={15} className="shelf-search-icon" />
              <input
                type="text"
                placeholder="Filter titles in shelf…"
                value={shelfSearch}
                onChange={(e) => setShelfSearch(e.target.value)}
                className="shelf-search-input"
              />
            </div>

            <div className="shelf-type-tabs">
              {MEDIA_TYPES.map((type) => (
                <button
                  key={type}
                  className={`shelf-type-tab ${shelfTypeFilter === type ? "is-active" : ""}`}
                  onClick={() => setShelfTypeFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="shelf-toolbar-right">
            <MediaViewToggle
              value={viewMode}
              onChange={updateViewMode}
              label="Shelf media view"
            />
            <button
              className="shelf-add-titles-cta"
              onClick={handleOpenAddTitles}
              title="Add or remove library titles in this shelf"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Manage Titles</span>
            </button>
          </div>
        </div>

        {/* Media Grid / List Content */}
        {shelfLoading ? (
          <PageLoader
            label="Loading shelf"
            detail="Fetching media items"
            compact
          />
        ) : visibleShelfMedia.length === 0 ? (
          <div className="shelves-empty-state">
            <FolderHeart size={54} strokeWidth={1.2} color="var(--accent)" />
            <h2>
              {shelfSearch || shelfTypeFilter !== "All"
                ? "No matching titles"
                : "This shelf is empty"}
            </h2>
            <p>
              {shelfSearch || shelfTypeFilter !== "All"
                ? "Try adjusting your search or type filter."
                : "Add titles from your library to organize and showcase them here."}
            </p>
            {!shelfSearch && shelfTypeFilter === "All" && (
              <button
                className="btn-primary"
                onClick={handleOpenAddTitles}
                style={{ marginTop: 14 }}
              >
                <Plus size={16} /> Add Titles Now
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              viewMode === "grid" ? "grid media-grid" : "library-media-list"
            }
          >
            {visibleShelfMedia.map((m) => (
              <MediaCard
                key={m._id}
                m={m}
                mode={viewMode}
                onEdit={openModal}
              />
            ))}
          </div>
        )}

        {/* Quick Add Titles Modal */}
        {showAddTitlesModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowAddTitlesModal(false)}
          >
            <div
              className="modal shelf-titles-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shelf-modal-header">
                <div>
                  <h3 className="shelf-modal-title">
                    Manage Titles in &ldquo;{activeShelf.name}&rdquo;
                  </h3>
                  <p className="shelf-modal-subtitle">
                    Select entries from your library to include in this shelf
                  </p>
                </div>
                <button
                  className="modal-close-btn"
                  onClick={() => setShowAddTitlesModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="shelf-modal-search-bar">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search library titles…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="shelf-titles-picker-list">
                {libraryLoading ? (
                  <PageLoader label="Loading library" compact />
                ) : filteredLibraryItems.length === 0 ? (
                  <p className="shelf-modal-empty">No titles found.</p>
                ) : (
                  filteredLibraryItems.map((item) => {
                    const isSelected = selectedShelfMediaIds.has(item._id);
                    return (
                      <div
                        key={item._id}
                        className={`shelf-picker-item ${isSelected ? "is-selected" : ""}`}
                        onClick={() => toggleTitleSelection(item._id)}
                      >
                        <div className="shelf-picker-cover">
                          <MediaArtwork media={item} />
                        </div>
                        <div className="shelf-picker-info">
                          <h4>{item.title}</h4>
                          <span>
                            {item.media_type} · {item.status}
                          </span>
                        </div>
                        <div className="shelf-picker-checkbox">
                          {isSelected ? <Check size={14} strokeWidth={3} /> : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="shelf-modal-footer">
                <span className="shelf-modal-selection-count">
                  <strong>{selectedShelfMediaIds.size}</strong> titles selected
                </span>
                <div className="shelf-modal-footer-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowAddTitlesModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveTitlesToShelf}
                    disabled={savingTitles}
                  >
                    {savingTitles ? <span className="spinner" /> : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // OVERVIEW VIEW: ALL SHELVES GRID
  // -------------------------------------------------------------
  return (
    <div className="shelves-view">
      {/* Shelves Dashboard Hero */}
      <section className="shelves-hero">
        <div className="shelves-hero-left">
          <div className="shelves-eyebrow">
            <Sparkles size={15} /> Curated Collections
          </div>
          <h1 className="shelves-hero-title">Your Custom Shelves</h1>
          <p className="shelves-hero-subtitle">
            Organize stories into custom collections, mood-based playlists, and
            thematic watchlists.
          </p>
          <div className="shelves-stats-row">
            <div className="shelves-stat-chip">
              <strong>{shelves.length}</strong>
              <span>{shelves.length === 1 ? "Shelf" : "Shelves"}</span>
            </div>
            <div className="shelves-stat-chip">
              <strong>{totalCuratedCount}</strong>
              <span>Curated Titles</span>
            </div>
          </div>
        </div>

        <div className="shelves-hero-right">
          <button
            className="shelves-create-cta"
            onClick={handleOpenCreate}
            title="Create a new shelf collection"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Create New Shelf</span>
          </button>
        </div>
      </section>

      {/* Overview Controls: Search & Sort */}
      <div className="shelves-overview-controls">
        <div className="shelves-search-wrap">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search shelves…"
            value={overviewSearch}
            onChange={(e) => setOverviewSearch(e.target.value)}
          />
        </div>

        <div className="shelves-sort-group">
          <span className="shelves-sort-label">Sort:</span>
          <button
            className={`shelves-sort-chip ${sortBy === "recent" ? "is-active" : ""}`}
            onClick={() => setSortBy("recent")}
          >
            Recently Added
          </button>
          <button
            className={`shelves-sort-chip ${sortBy === "count" ? "is-active" : ""}`}
            onClick={() => setSortBy("count")}
          >
            Most Titles
          </button>
          <button
            className={`shelves-sort-chip ${sortBy === "alpha" ? "is-active" : ""}`}
            onClick={() => setSortBy("alpha")}
          >
            A-Z
          </button>
        </div>
      </div>

      {/* Empty State */}
      {shelves.length === 0 ? (
        <div className="shelves-empty-state">
          <FolderPlus size={58} strokeWidth={1.2} color="var(--accent)" />
          <h2>No shelves created yet</h2>
          <p>
            Create bespoke collections to categorize your favorite anime, manhwa,
            and manga.
          </p>
          <button
            className="btn-primary"
            onClick={handleOpenCreate}
            style={{ marginTop: 16 }}
          >
            <Plus size={16} /> Create Your First Shelf
          </button>
        </div>
      ) : filteredShelves.length === 0 ? (
        <div className="shelves-empty-state">
          <FolderHeart size={48} strokeWidth={1.2} color="var(--text-muted)" />
          <h2>No shelves match &ldquo;{overviewSearch}&rdquo;</h2>
          <p>Try searching with another name or clear your search query.</p>
        </div>
      ) : (
        <div className="shelves-gallery-grid">
          {filteredShelves.map((shelf) => {
            const previews: ShelfPreviewItem[] = shelf.previews || [];
            const count = shelf.item_count ?? shelf.media_ids?.length ?? 0;

            return (
              <div
                key={shelf._id}
                className="shelf-gallery-card"
                onClick={() => setActiveShelf(shelf)}
              >
                {/* 3D Stacked Cover Artwork Showcase */}
                <div className="shelf-artwork-stage">
                  {previews.length > 0 ? (
                    <div className="shelf-cover-stack">
                      {previews.slice(0, 3).map((item, idx) => (
                        <div
                          key={item._id}
                          className={`shelf-cover-layer shelf-cover-layer-${idx + 1}`}
                        >
                          <MediaArtwork media={item as MediaItem} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="shelf-cover-empty">
                      <FolderHeart size={32} strokeWidth={1.5} />
                      <span>Empty Shelf</span>
                    </div>
                  )}

                  <div className="shelf-stage-badge">
                    <Layers3 size={13} />
                    <span>
                      {count} {count === 1 ? "title" : "titles"}
                    </span>
                  </div>
                </div>

                {/* Card Information */}
                <div className="shelf-gallery-info">
                  <div className="shelf-gallery-header">
                    <h3 className="shelf-gallery-title">{shelf.name}</h3>
                    <div className="shelf-card-quick-actions">
                      <button
                        type="button"
                        className="shelf-card-action-btn"
                        onClick={(e) => handleOpenEdit(e, shelf)}
                        title="Edit Shelf"
                        aria-label="Edit Shelf"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="shelf-card-action-btn is-danger"
                        onClick={(e) => handleDeleteShelf(e, shelf._id)}
                        disabled={deleteLoading === shelf._id}
                        title="Delete Shelf"
                        aria-label="Delete Shelf"
                      >
                        {deleteLoading === shelf._id ? (
                          <span className="spinner" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="shelf-gallery-desc">
                    {shelf.description || (
                      <span className="is-placeholder">
                        No description provided.
                      </span>
                    )}
                  </p>

                  <div className="shelf-gallery-footer">
                    <span className="shelf-explore-link">
                      Open Collection &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Shelf Modal */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="modal shelf-create-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shelf-modal-header">
              <div>
                <h3 className="shelf-modal-title">
                  {editingShelf ? "Edit Shelf" : "Create New Shelf"}
                </h3>
                <p className="shelf-modal-subtitle">
                  {editingShelf
                    ? "Update the collection name and description"
                    : "Create a bespoke collection to organize your library"}
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveShelf} className="shelf-form-body">
              <div className="shelf-form-group">
                <label htmlFor="shelf-name-input">Shelf Name</label>
                <input
                  id="shelf-name-input"
                  type="text"
                  placeholder="e.g. Masterpieces, Cozy Comforts, Peak Shonen"
                  value={shelfNameInput}
                  onChange={(e) => setShelfNameInput(e.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                />
              </div>

              <div className="shelf-form-group">
                <label htmlFor="shelf-desc-input">Description (Optional)</label>
                <textarea
                  id="shelf-desc-input"
                  placeholder="What belongs in this collection? (e.g. Best animated fight scenes and story arcs)"
                  value={shelfDescInput}
                  onChange={(e) => setShelfDescInput(e.target.value)}
                  maxLength={300}
                  rows={3}
                />
              </div>

              <div className="shelf-modal-footer-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!shelfNameInput.trim() || formSubmitting}
                >
                  {formSubmitting ? (
                    <span className="spinner" />
                  ) : editingShelf ? (
                    "Save Changes"
                  ) : (
                    "Create Shelf"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
