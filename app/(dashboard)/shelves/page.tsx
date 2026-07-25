"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Plus, FolderPlus, ArrowLeft, Trash2, Layers, AlignLeft } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { Shelf, MediaItem } from "@/types/media";
import { PageLoader } from "@/components/PageLoader";
import { useFeedback } from "@/components/FeedbackProvider";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { MediaViewMode, MediaViewToggle } from "@/components/MediaViewToggle";

const SHELF_VIEW_KEY = "chronicle:shelf-view:v1";

export default function ShelvesPage() {
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeShelf, setActiveShelf] = useState<Shelf | null>(null);
  const [shelfMedia, setShelfMedia] = useState<MediaItem[]>([]);
  const [shelfLoading, setShelfLoading] = useState(false);
  
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfDesc, setNewShelfDesc] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
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
    }
    finally { setLoading(false); }
  }, []);

  const fetchShelfMedia = useCallback(async (shelfId: string) => {
    resetCoverQueue();
    setShelfLoading(true);
    try {
      const data = await apiRequest<{ items?: MediaItem[] }>(
        `/api/shelves?id=${shelfId}`,
        { cache: "no-store" },
      );
      setShelfMedia(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setShelfMedia([]);
      toast(getErrorMessage(err, "Shelf could not load"), "error");
    } finally {
      setShelfLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setActiveRoute("shelves");
    resetCoverQueue();
    loadCoverCache();
    fetchShelves();
  }, [fetchShelves, setActiveRoute, mediaRev]);

  useEffect(() => {
    if (activeShelf) fetchShelfMedia(activeShelf._id!);
  }, [activeShelf, fetchShelfMedia]);

  useEffect(() => {
    const saved = window.localStorage.getItem(SHELF_VIEW_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const updateViewMode = (mode: MediaViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(SHELF_VIEW_KEY, mode);
  };

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName) return;
    setCreateLoading(true);
    try {
      await apiRequest("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShelfName, description: newShelfDesc }),
      });
      setNewShelfName("");
      setNewShelfDesc("");
      setShowCreate(false);
      toast("Shelf created", "success");
      fetchShelves();
    } catch (err) {
      toast(getErrorMessage(err, "Could not create shelf"), "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteShelf = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const approved = await confirm({
      title: "Delete shelf?",
      message: "Media entries remain in your Library.",
      confirmLabel: "Delete shelf",
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
    }
    finally { setDeleteLoading(null); }
  };

  const hasShelves = shelves.length > 0;

  if (loading) {
    return <PageLoader label="Opening shelves" detail="Collecting your collections" compact />;
  }

  if (loadError && shelves.length === 0) {
    return (
      <div className="state-panel state-error">
        <h2>Shelves unavailable.</h2>
        <p>{loadError}</p>
        <button className="btn-primary" onClick={fetchShelves}>Try again</button>
      </div>
    );
  }

  // ACTIVE SHELF VIEW (Drill-down)
  if (activeShelf) {
    return (
      <div className="shelves-container">
        <div className="active-shelf-header">
          <div className="active-shelf-top">
            <button className="btn-ghost" onClick={() => setActiveShelf(null)} style={{ paddingLeft: 0 }}>
              <ArrowLeft size={16} /> Back to Shelves
            </button>
            <button 
              className="btn-danger" 
              onClick={(e) => handleDeleteShelf(e, activeShelf._id!)}
              disabled={deleteLoading === activeShelf._id}
            >
              {deleteLoading === activeShelf._id ? <span className="spinner" /> : <Trash2 size={16} />} 
              Delete Shelf
            </button>
          </div>
          <div className="active-shelf-info">
            <h1><Layers size={28} color="var(--accent)" /> {activeShelf.name}</h1>
            {activeShelf.description && <p>{activeShelf.description}</p>}
          </div>
          <MediaViewToggle value={viewMode} onChange={updateViewMode} label="Shelf media view" />
        </div>

        {shelfLoading ? (
          <PageLoader label="Loading shelf" detail="Finding linked entries" compact />
        ) : shelfMedia.length === 0 ? (
          <div className="shelves-empty-state" style={{ minHeight: '30vh' }}>
            <AlignLeft size={48} strokeWidth={1} color="var(--text-muted)" />
            <h2>Empty Shelf</h2>
            <p>This shelf has no items. Edit entries in your library to add them here.</p>
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid media-grid" : "library-media-list"}>
            {shelfMedia.map((m) => (
              <MediaCard key={m._id} m={m} mode={viewMode} onEdit={openModal} />
            ))}
          </div>
        )}

        <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
          <Plus size={28} strokeWidth={3} />
        </button>
      </div>
    );
  }

  // DEFAULT VIEW (Shelf Grid)
  return (
    <div className="shelves-container">
      <div className="shelves-header-bar">
        <h2>Your Shelves</h2>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} strokeWidth={2.5} /> New Shelf
        </button>
      </div>

      {showCreate && (
        <div className="shelf-create-panel">
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0' }}>Create New Shelf</h3>
          <form className="shelf-create-panel-form" onSubmit={handleCreateShelf}>
            <input
              type="text"
              placeholder="Shelf Name (e.g., Masterpieces)"
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newShelfDesc}
              onChange={(e) => setNewShelfDesc(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!newShelfName || createLoading}>
              {createLoading ? <span className="spinner" /> : "Create"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {!hasShelves && !showCreate ? (
        <div className="shelves-empty-state">
          <FolderPlus size={64} strokeWidth={1} color="var(--text-muted)" />
          <h2>No Shelves Yet</h2>
          <p>Shelves let you organize your library into custom collections like Top Tier, Comfort Watches, or Binge Queue.</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: '16px' }}>
            <FolderPlus size={16} /> Create Your First Shelf
          </button>
        </div>
      ) : (
        <div className="shelf-grid">
          {shelves.map((s) => (
            <div key={s._id} className="shelf-card" onClick={() => setActiveShelf(s)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="shelf-card-icon">
                  <Layers size={24} />
                </div>
                <button 
                  className="shelf-card-delete"
                  onClick={(e) => handleDeleteShelf(e, s._id!)}
                  title="Delete Shelf"
                  disabled={deleteLoading === s._id}
                >
                  {deleteLoading === s._id ? <span className="spinner" /> : <Trash2 size={16} />}
                </button>
              </div>
              <h3 className="shelf-card-title">{s.name}</h3>
              <div className="shelf-card-desc">
                {s.description || <span style={{ opacity: 0.5 }}>No description provided.</span>}
              </div>
              <div className="shelf-card-footer">
                <span style={{ color: 'var(--text-secondary)' }}>Click to open</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>View Shelf &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
        <Plus size={28} strokeWidth={3} />
      </button>
    </div>
  );
}
