"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Plus } from "lucide-react";
import { useEffect, useCallback, useState } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { MediaItem } from "@/types/media";

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

  const fetchMedia = useCallback(async () => {
    resetCoverQueue();
    setLoading(true, false);
    setLoadingData(true);
    try {
      const res = await fetch(`/api/media?limit=1000&status=Dropped`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setMedia(json.data.items, json.data.total, false, true);
    } catch {}
    finally { setLoading(false); setLoadingData(false); }
  }, [setMedia, setLoading]);

  useEffect(() => {
    setActiveRoute("droppedyard");
    resetCoverQueue();
    loadCoverCache();
    fetchMedia();
  }, [fetchMedia, setActiveRoute, mediaRev]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry entirely?")) return;
    setPendingIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      fetchMedia();
    } catch {}
    finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleToggleRetry = async (m: MediaItem) => {
    if (pendingIds.has(m._id)) return;
    setPendingIds(prev => new Set(prev).add(m._id));
    try {
      await fetch(`/api/media?id=${m._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry_flag: !m.retry_flag }),
      });
      fetchMedia();
    } catch {}
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
        <div style={{ display: "flex", gap: "12px" }}>
          <button className={`filter-pill ${activeTab === "graveyard" ? "active" : ""}`} onClick={() => setActiveTab("graveyard")}>Graveyard ({graveyardItems.length})</button>
          <button className={`filter-pill ${activeTab === "revisit" ? "active" : ""}`} onClick={() => setActiveTab("revisit")}>Maybe Revisit ({revisitItems.length})</button>
        </div>
      </div>

      {loadingData && media.length === 0 ? (
        <div className="loading-state"><span className="spinner" /> Loading entries...</div>
      ) : (
        <div className="grid">
          {displayItems.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-state-icon">🪦</div>
              <h3>Nothing here yet</h3>
              <p>{activeTab === "revisit" ? "You haven't marked any dropped entries for a second chance." : "No permanently dropped entries."}</p>
            </div>
          ) : (
            displayItems.map((m) => (
              <div key={m._id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <MediaCard m={m} onEdit={openModal} onDelete={handleDelete} />
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
