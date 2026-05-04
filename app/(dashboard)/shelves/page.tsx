"use client";

import { useMediaStore } from "@/store/mediaStore";
import { MediaCard } from "@/components/MediaCard";
import { Plus, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { loadCoverCache, resetCoverQueue } from "@/store/coverCache";
import { Shelf, MediaItem } from "@/types/media";

export default function ShelvesPage() {
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeShelf, setActiveShelf] = useState<Shelf | null>(null);
  const [shelfMedia, setShelfMedia] = useState<MediaItem[]>([]);
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfDesc, setNewShelfDesc] = useState("");

  const fetchShelves = useCallback(async () => {
    try {
      const res = await fetch("/api/shelves", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setShelves(data.data?.items || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  const fetchShelfMedia = useCallback(async (shelfId: string) => {
    resetCoverQueue();
    try {
      const res = await fetch(`/api/shelves?id=${shelfId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data.data?.items)
          ? data.data.items
          : Array.isArray(data.items)
            ? data.items
            : [];
        setShelfMedia(items);
      }
    } catch {
      setShelfMedia([]);
    }
  }, []);

  useEffect(() => {
    setActiveRoute("shelves");
    resetCoverQueue();
    loadCoverCache();
    fetchShelves();
  }, [fetchShelves, setActiveRoute, mediaRev]);

  useEffect(() => {
    if (activeShelf) fetchShelfMedia(activeShelf._id!);
  }, [activeShelf, fetchShelfMedia]);

  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName) return;
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShelfName, description: newShelfDesc }),
      });
      if (res.ok) {
        setNewShelfName("");
        setNewShelfDesc("");
        fetchShelves();
      }
    } catch {}
  };

  const handleDeleteShelf = async (id: string) => {
    if (!confirm("Delete this shelf? Media entries will not be deleted.")) return;
    try {
      const res = await fetch(`/api/shelves?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        if (activeShelf?._id === id) setActiveShelf(null);
        fetchShelves();
      }
    } catch {}
  };

  return (
    <>
      <div className="controls" style={{ marginBottom: "24px", flexDirection: "column", alignItems: "flex-start" }}>
        <h3 style={{ marginBottom: "12px", color: "var(--text-primary)" }}>Create New Shelf</h3>
        <form onSubmit={handleCreateShelf} style={{ display: "flex", gap: "12px", width: "100%", flexWrap: "wrap" }}>
          <input 
            type="text" 
            placeholder="Shelf Name" 
            value={newShelfName} 
            onChange={(e) => setNewShelfName(e.target.value)} 
            required 
            style={{ flex: "1", minWidth: "200px" }}
          />
          <input 
            type="text" 
            placeholder="Description (optional)" 
            value={newShelfDesc} 
            onChange={(e) => setNewShelfDesc(e.target.value)} 
            style={{ flex: "2", minWidth: "200px" }}
          />
          <button type="submit" className="btn-primary" disabled={!newShelfName}>Create</button>
        </form>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        <button 
          className={`filter-pill ${!activeShelf ? "active" : ""}`} 
          onClick={() => setActiveShelf(null)}
        >
          All Shelves Overview
        </button>
        {(shelves || []).map(s => (
          <button 
            key={s._id} 
            className={`filter-pill ${activeShelf?._id === s._id ? "active" : ""}`} 
            onClick={() => setActiveShelf(s)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {!activeShelf ? (
        <div className="grid">
          {loading ? (
            <div className="loading-state" style={{ gridColumn: "1 / -1" }}>
              <span className="spinner" /> Loading shelves...
            </div>
          ) : (shelves || []).length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-state-icon"><Folder size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
              <h3>No Shelves Created</h3>
              <p>Create a shelf above to organize your library.</p>
            </div>
          ) : (
            (shelves || []).map(s => (
              <div key={s._id} className="card" style={{ padding: "16px", background: "var(--bg-raised)", display: "flex", flexDirection: "column" }}>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: "0 0 4px 0" }}>{s.name}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "16px", flex: 1 }}>{s.description || "No description."}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn-ghost" onClick={() => setActiveShelf(s)}>View Contents</button>
                  <button className="btn-ghost" onClick={() => handleDeleteShelf(s._id!)} style={{ color: "var(--red)" }}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "1.5rem", color: "var(--text-primary)" }}>{activeShelf.name}</h2>
            <p style={{ color: "var(--text-secondary)" }}>{activeShelf.description}</p>
          </div>
          
          <div className="grid">
            {(shelfMedia || []).length === 0 ? (
              <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                <div className="empty-state-icon"><FolderOpen size={48} style={{ color: "var(--text-secondary)", opacity: 0.5 }} /></div>
                <h3>Shelf is empty</h3>
                <p>Edit entries in your library to add them to this shelf.</p>
              </div>
            ) : (
              (shelfMedia || []).map((m) => (
                <MediaCard key={m._id} m={m} onEdit={openModal} />
              ))
            )}
          </div>
        </>
      )}

      <button className="btn-fab" aria-label="Add Entry" onClick={() => openModal(null)}>
        <Plus size={28} strokeWidth={3} />
      </button>
    </>
  );
}
