"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { ArchiveX, Plus } from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { MediaItem } from "@/types/media";
import { useFeedback } from "@/components/FeedbackProvider";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { MediaViewMode, MediaViewToggle } from "@/components/MediaViewToggle";

const DROPPEDYARD_VIEW_KEY = "chronicle:droppedyard-view:v1";

export default function DroppedyardPage() {
  const media = useMediaStore((state) => state.media);
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setMedia = useMediaStore((state) => state.setMedia);
  const setLoading = useMediaStore((state) => state.setLoading);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const [activeTab, setActiveTab] = useState<"graveyard" | "revisit">("graveyard");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<MediaViewMode>("grid");
  const { toast, confirm } = useFeedback();

  const fetchMedia = useCallback(async () => {
    resetCoverQueue();
    setLoading(true, false);
    setLoadingData(true);
    setLoadError("");
    try {
      const data = await apiRequest<{ items: MediaItem[]; total: number }>(
        "/api/media?limit=1000&status=Dropped",
        { cache: "no-store" },
      );
      setMedia(data.items, data.total, false, true);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Droppedyard could not load"));
    }
    finally { setLoading(false); setLoadingData(false); }
  }, [setMedia, setLoading]);

  useEffect(() => {
    setActiveRoute("droppedyard");
    resetCoverQueue();
    loadCoverCache();
    fetchMedia();
  }, [fetchMedia, setActiveRoute, mediaRev]);

  useEffect(() => {
    const saved = window.localStorage.getItem(DROPPEDYARD_VIEW_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const updateViewMode = (mode: MediaViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(DROPPEDYARD_VIEW_KEY, mode);
  };

  const handleDelete = async (id: string) => {
    const approved = await confirm({
      title: "Delete dropped entry?",
      message: "This permanently removes the entry and its recent activity.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!approved) return;
    setPendingIds(prev => new Set(prev).add(id));
    try {
      await apiRequest(`/api/media?id=${id}`, { method: "DELETE" });
      toast("Entry deleted", "success");
      fetchMedia();
    } catch (err) {
      toast(getErrorMessage(err, "Delete failed"), "error");
    }
    finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleToggleRetry = async (m: MediaItem) => {
    if (pendingIds.has(m._id)) return;
    setPendingIds(prev => new Set(prev).add(m._id));
    try {
      await apiRequest(`/api/media?id=${m._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry_flag: !m.retry_flag }),
      });
      toast(m.retry_flag ? "Moved to graveyard" : "Marked to revisit", "success");
      fetchMedia();
    } catch (err) {
      toast(getErrorMessage(err, "Could not update revisit status"), "error");
    }
    finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(m._id); return n; });
    }
  };

  const revisitItems = media.filter(m => m.retry_flag);
  const graveyardItems = media.filter(m => !m.retry_flag);

  const displayItems = activeTab === "revisit" ? revisitItems : graveyardItems;

  return (
    <>
      <div className="controls" style={{ marginBottom: "24px" }}>
        <div className="droppedyard-toolbar">
          <div style={{ display: "flex", gap: "12px" }}>
          <button className={`filter-pill ${activeTab === "graveyard" ? "active" : ""}`} onClick={() => setActiveTab("graveyard")}>Graveyard ({graveyardItems.length})</button>
          <button className={`filter-pill ${activeTab === "revisit" ? "active" : ""}`} onClick={() => setActiveTab("revisit")}>Maybe Revisit ({revisitItems.length})</button>
          </div>
          <MediaViewToggle value={viewMode} onChange={updateViewMode} label="Droppedyard view" />
        </div>
      </div>

      {loadError && media.length === 0 ? (
        <div className="state-panel state-error">
          <h2>Droppedyard unavailable.</h2>
          <p>{loadError}</p>
          <button className="btn-primary" onClick={fetchMedia}>Try again</button>
        </div>
      ) : loadingData && media.length === 0 ? (
        <div className="loading-state"><span className="spinner" /> Loading entries...</div>
      ) : (
        <div className={viewMode === "grid" ? "grid media-grid" : "library-media-list droppedyard-media-list"}>
          {displayItems.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-state-icon"><ArchiveX size={42} /></div>
              <h3>Nothing here yet</h3>
              <p>{activeTab === "revisit" ? "You haven't marked any dropped entries for a second chance." : "No permanently dropped entries."}</p>
            </div>
          ) : (
            displayItems.map((m) => (
              <div key={m._id} className="droppedyard-media-item">
                <MediaCard m={m} mode={viewMode} onEdit={openModal} onDelete={handleDelete} />
                <button 
                  onClick={() => handleToggleRetry(m)}
                  className="btn-ghost"
                  style={{ width: "100%", fontSize: "0.8rem", padding: "6px" }}
                  disabled={pendingIds.has(m._id)}
                >
                  {pendingIds.has(m._id) ? <span className="spinner" /> : (m.retry_flag ? "Move to Graveyard" : "Mark as Maybe Revisit")}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
        <Plus size={28} strokeWidth={3} />
      </button>
    </>
  );
}
