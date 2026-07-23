"use client";

import { useState, useEffect } from "react";
import { MediaItem, Shelf } from "@/types/media";
import { X, Link as LinkIcon, Tv, Book, Video, BookOpen } from "lucide-react";

interface MediaModalProps {
  media: MediaItem | null;
  onClose: () => void;
  onSave: () => void;
}

type LinkSearchResult = {
  _id: string;
  title: string;
  media_type: string;
};

type MediaFormData = Partial<
  Omit<MediaItem, "progress_current" | "progress_total" | "rating">
> & {
  progress_current?: number | "";
  progress_total?: number | "";
  rating?: number | "";
};

const NUMBER_FIELDS = new Set(["progress_current", "progress_total", "rating"]);

function getShelfMediaIds(shelf: Shelf): string[] {
  return Array.isArray(shelf.media_ids) ? shelf.media_ids.map(String) : [];
}

function numberInputValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeNumericFormFields(data: MediaFormData): Partial<MediaItem> {
  return {
    ...data,
    progress_current:
      data.progress_current === "" ? 0 : Number(data.progress_current || 0),
    progress_total:
      data.progress_total === "" ? 0 : Number(data.progress_total || 0),
    rating: data.rating === "" ? 0 : Number(data.rating || 0),
  };
}

export function MediaModal({ media, onClose, onSave }: MediaModalProps) {
  const [formData, setFormData] = useState<MediaFormData>({
    title: "",
    media_type: "Anime",
    status: "Active",
    progress_current: 0,
    progress_total: 0,
    rating: 0,
    notes: "",
    tracker_url: "",
    mangadex_id: "",
    custom_cover_url: "",
    drop_reason: "",
    retry_flag: false,
  });
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(new Set());
  const [originalShelfIds, setOriginalShelfIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [testingTracker, setTestingTracker] = useState(false);
  const [error, setError] = useState("");
  const [trackerResult, setTrackerResult] = useState("");

  const [linkSearch, setLinkSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LinkSearchResult[]>([]);
  const [linkedEntries, setLinkedEntries] = useState<{ _id: string; title: string }[]>([]);

  useEffect(() => {
    if (media) {
      const initialData = { ...media };
      if (initialData.status === "Watching/Reading") {
        initialData.status = "Active";
      }
      setFormData(initialData);
      setTrackerResult("");
      if (media.linked_entries_data) {
        setLinkedEntries(media.linked_entries_data);
      }
    } else {
      setFormData({
        title: "",
        media_type: "Anime",
        status: "Active",
        progress_current: 0,
        progress_total: 0,
        rating: 0,
        notes: "",
        tracker_url: "",
        mangadex_id: "",
        custom_cover_url: "",
        drop_reason: "",
        retry_flag: false,
      });
      setLinkedEntries([]);
      setTrackerResult("");
    }

    setSelectedShelfIds(new Set());
    setOriginalShelfIds(new Set());

    fetch("/api/shelves", { cache: "no-store" })
      .then(res => res.json())
      .then(json => {
        const items = Array.isArray(json.data?.items) ? json.data.items as Shelf[] : [];
        setShelves(items);
        if (items.length > 0) {
          if (media) {
            const activeIds = new Set<string>();
            items.forEach((s) => {
              if (getShelfMediaIds(s).includes(media._id)) activeIds.add(s._id);
            });
            setSelectedShelfIds(activeIds);
            setOriginalShelfIds(new Set(activeIds));
          }
        }
      })
      .catch(() => {
        setShelves([]);
      });
  }, [media]);

  useEffect(() => {
    if (linkSearch.length > 2) {
      const t = setTimeout(() => {
        fetch(`/api/media?search=${encodeURIComponent(linkSearch)}&limit=10`, { cache: "no-store" })
          .then(res => res.json())
          .then(json => {
            if (json.data?.items) {
              setSearchResults(
                (json.data.items as MediaItem[]).map((item) => ({
                  _id: item._id,
                  title: item.title,
                  media_type: item.media_type,
                })),
              );
            }
          });
      }, 300);
      return () => clearTimeout(t);
    } else {
      setSearchResults([]);
    }
  }, [linkSearch]);

  const toggleShelf = (id: string) => {
    setSelectedShelfIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (NUMBER_FIELDS.has(name)) {
      setFormData((prev) => ({
        ...prev,
        [name]: value === "" ? "" : Number(value),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleLink = async (targetId: string, title: string) => {
    if (!media) {
      alert("Please save this entry first before linking.");
      return;
    }
    if (linkedEntries.find(l => l._id === targetId)) return;
    if (targetId === media._id) return;
    
    try {
      await fetch("/api/media/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: media._id, targetId, action: "link" })
      });
      setLinkedEntries(prev => [...prev, { _id: targetId, title }]);
      setLinkSearch("");
    } catch {}
  };

  const handleUnlink = async (targetId: string) => {
    if (!media) return;
    try {
      await fetch("/api/media/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: media._id, targetId, action: "unlink" })
      });
      setLinkedEntries(prev => prev.filter(l => l._id !== targetId));
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const method = media ? "PUT" : "POST";
      const url = media ? `/api/media?id=${media._id}` : "/api/media";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeNumericFormFields(formData)),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save");
      }

      const mediaId = media ? media._id : data.data._id;

      // Update shelves if changed
      for (const s of shelves) {
        const wasSelected = originalShelfIds.has(s._id);
        const isSelected = selectedShelfIds.has(s._id);
        if (wasSelected !== isSelected) {
          const shelfMediaIds = getShelfMediaIds(s);
          const newMediaIds = isSelected
            ? Array.from(new Set([...shelfMediaIds, mediaId]))
            : shelfMediaIds.filter(id => id !== mediaId);
          await fetch(`/api/shelves?id=${s._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media_ids: newMediaIds }),
          });
        }
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleTestTracker = async () => {
    setTestingTracker(true);
    setError("");
    setTrackerResult("");

    try {
      const res = await fetch("/api/media/test-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: media?._id,
          tracker_url: formData.tracker_url,
          media_type: formData.media_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Tracker test failed");
      }
      setTrackerResult(`Latest found: ${data.data?.latest ?? "none"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracker test failed");
    } finally {
      setTestingTracker(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal entry-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close entry form">
          <X size={24} />
        </button>
        <div className="modal-header">{media ? "Edit Entry" : "Add Entry"}</div>
        
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-scroll">
            <div className="modal-section-label">Entry</div>
            <div className="form-grid full">
              <div className="form-group">
                <label>Title</label>
                <input className="form-input" required name="title" value={formData.title || ""} onChange={handleChange} />
              </div>
            </div>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Type</label>
                <select className="form-input" name="media_type" value={formData.media_type || "Anime"} onChange={handleChange}>
                  <option value="Anime">Anime</option>
                  <option value="Manhwa">Manhwa</option>
                  <option value="Donghua">Donghua</option>
                  <option value="Light Novel">Light Novel</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-input" name="status" value={formData.status || "Active"} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Planned">Planned</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Dropped">Dropped</option>
                </select>
              </div>
              <div className="form-group">
                <label>Current Progress</label>
                <input type="number" min="0" step="any" inputMode="decimal" className="form-input" name="progress_current" value={numberInputValue(formData.progress_current)} onChange={handleChange} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Total Progress</label>
                <input type="number" min="0" step="any" inputMode="decimal" className="form-input" name="progress_total" value={numberInputValue(formData.progress_total)} onChange={handleChange} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Rating (0-10)</label>
                <input type="number" min="0" max="10" step="0.5" className="form-input" name="rating" value={numberInputValue(formData.rating)} onChange={handleChange} placeholder="0" />
              </div>
              <div className="form-group">
                <label>MangaDex ID</label>
                <input className="form-input" name="mangadex_id" value={formData.mangadex_id || ""} onChange={handleChange} placeholder="Optional" />
              </div>
            </div>

            {formData.status === "Dropped" && (
              <>
                <div className="modal-section-label">Dropped</div>
                <div className="form-grid full">
                  <div className="form-group">
                    <label>Drop Reason</label>
                    <input className="form-input" name="drop_reason" value={formData.drop_reason || ""} onChange={handleChange} placeholder="Why did you drop this?" />
                  </div>
                  <label className="inline-check">
                    <input type="checkbox" name="retry_flag" checked={formData.retry_flag || false} onChange={handleChange} />
                    <span>Retry later? Mark for revisit</span>
                  </label>
                </div>
              </>
            )}

            <div className="modal-section-label">Links & Notes</div>
            <div className="form-grid full">
              <div className="form-group">
                <label>Custom Cover URL</label>
                <input className="form-input" name="custom_cover_url" value={formData.custom_cover_url || ""} onChange={handleChange} placeholder="Optional override" />
              </div>
              <div className="form-group">
                <label>Tracker URL</label>
                <input className="form-input" name="tracker_url" value={formData.tracker_url || ""} onChange={handleChange} placeholder="Optional tracker link" />
                {(formData.media_type === "Manhwa" || formData.media_type === "Donghua") && (
                  <div className="tracker-test-row">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handleTestTracker}
                      disabled={testingTracker || !formData.tracker_url}
                    >
                      {testingTracker ? <span className="spinner" /> : <LinkIcon size={14} />}
                      Test tracker
                    </button>
                    {trackerResult && <span>{trackerResult}</span>}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-input" name="notes" value={formData.notes || ""} onChange={handleChange} rows={4} />
              </div>
            </div>

            {media && (
              <>
                <div className="modal-section-label">Linked Entries</div>
                <div className="linked-entry-panel">
                  <div className="linked-entry-list">
                    {linkedEntries.map(l => (
                      <div key={l._id} className="linked-entry-chip">
                        <LinkIcon size={12} />
                        <span>{l.title}</span>
                        <button type="button" onClick={() => handleUnlink(l._id)} aria-label={`Unlink ${l.title}`}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="linked-entry-search">
                    <input
                      className="form-input"
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Search to link another entry..."
                    />
                    {searchResults.length > 0 && (
                      <div className="linked-entry-results">
                        {searchResults.map(s => {
                          let Icon = Book;
                          if (s.media_type === "Anime") Icon = Tv;
                          else if (s.media_type === "Donghua") Icon = Video;
                          else if (s.media_type === "Light Novel") Icon = BookOpen;

                          return (
                            <button key={s._id} type="button" onClick={() => handleLink(s._id, s.title)} className="linked-entry-result">
                              <Icon size={14} />
                              <span>{s.title}</span>
                              <small>{s.media_type}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {shelves.length > 0 && (
              <div className="form-group">
                <div className="modal-section-label">Shelves</div>
                <div className="shelf-picker">
                  {shelves.map(s => (
                    <label key={s._id} className="shelf-chip" data-selected={selectedShelfIds.has(s._id) ? "true" : "false"}>
                      <input type="checkbox" checked={selectedShelfIds.has(s._id)} onChange={() => toggleShelf(s._id)} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
