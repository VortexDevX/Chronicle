"use client";

import { useState, useEffect } from "react";
import { MediaItem, Shelf } from "@/types/media";
import {
  X,
  Link as LinkIcon,
  Tv,
  Book,
  Video,
  BookOpen,
  Sparkles,
  Info,
  Sliders,
  Layers,
  Globe,
} from "lucide-react";
import { useFeedback } from "@/components/FeedbackProvider";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { normalizeMangaDexId } from "@/lib/mangadex";

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
  const { toast } = useFeedback();
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
  const isScreenMedia = formData.media_type === "Anime" || formData.media_type === "Donghua";

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
      .then((res) => res.json())
      .then((json) => {
        const items = Array.isArray(json.data?.items) ? (json.data.items as Shelf[]) : [];
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
        toast("Shelves are temporarily unavailable", "info");
      });
  }, [media, toast]);

  useEffect(() => {
    if (linkSearch.length > 2) {
      const t = setTimeout(() => {
        fetch(`/api/media?search=${encodeURIComponent(linkSearch)}&limit=10`, { cache: "no-store" })
          .then((res) => res.json())
          .then((json) => {
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
    setSelectedShelfIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
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

  const normalizeMangaDexField = () => {
    const current = String(formData.mangadex_id || "").trim();
    if (!current) return;
    const id = normalizeMangaDexId(current);
    if (id) setFormData((previous) => ({ ...previous, mangadex_id: id }));
  };

  const handleLink = async (targetId: string, title: string) => {
    if (!media) {
      toast("Save this entry before linking another title.", "info");
      return;
    }
    if (linkedEntries.find((l) => l._id === targetId)) return;
    if (targetId === media._id) return;

    try {
      await apiRequest("/api/media/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: media._id, targetId, action: "link" }),
      });
      setLinkedEntries((prev) => [...prev, { _id: targetId, title }]);
      setLinkSearch("");
    } catch (err) {
      toast(getErrorMessage(err, "Could not link entry"), "error");
    }
  };

  const handleUnlink = async (targetId: string) => {
    if (!media) return;
    try {
      await apiRequest("/api/media/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: media._id, targetId, action: "unlink" }),
      });
      setLinkedEntries((prev) => prev.filter((l) => l._id !== targetId));
    } catch (err) {
      toast(getErrorMessage(err, "Could not unlink entry"), "error");
    }
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
        body: JSON.stringify((() => {
          const cleanData: Record<string, unknown> = { ...normalizeNumericFormFields(formData) };
          delete cleanData.schedule_source_url;
          return cleanData;
        })()),
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
            : shelfMediaIds.filter((id) => id !== mediaId);
          await apiRequest(`/api/shelves?id=${s._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media_ids: newMediaIds }),
          });
        }
      }

      onSave();
      toast(media ? "Entry updated" : "Entry added", "success");
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
    <div className="modal-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        className="modal entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-modal-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close entry form"
          title="Close (esc)"
        >
          <X size={20} />
        </button>
        <div className="modal-header" id="entry-modal-title">
          {media ? "Edit Entry" : "Add Entry"}
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-scroll">
            {/* Section 1: Basics */}
            <div className="modal-section-header">
              <Info size={15} />
              <span>Basics</span>
            </div>
            <div className="form-grid full">
              <div className="form-group">
                <label htmlFor="media-title">Title</label>
                <input
                  id="media-title"
                  className="form-input"
                  required
                  name="title"
                  value={formData.title || ""}
                  onChange={handleChange}
                  placeholder="e.g. One Piece, Solo Leveling"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="media-type">Type</label>
                <select
                  id="media-type"
                  className="form-input"
                  name="media_type"
                  value={formData.media_type || "Anime"}
                  onChange={handleChange}
                >
                  <option value="Anime">Anime</option>
                  <option value="Manhwa">Manhwa</option>
                  <option value="Donghua">Donghua</option>
                  <option value="Light Novel">Light Novel</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="media-status">Status</label>
                <select
                  id="media-status"
                  className="form-input"
                  name="status"
                  value={formData.status || "Active"}
                  onChange={handleChange}
                >
                  <option value="Active">Active</option>
                  <option value="Planned">Planned</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Dropped">Dropped</option>
                </select>
              </div>
            </div>

            {/* Section 2: Progress & Rating */}
            <div className="modal-section-header">
              <Sliders size={15} />
              <span>Progress & Rating</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="media-progress-current">Current Progress</label>
                <input
                  id="media-progress-current"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="form-input"
                  name="progress_current"
                  value={numberInputValue(formData.progress_current)}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label htmlFor="media-progress-total">Total Progress (Optional)</label>
                <input
                  id="media-progress-total"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="form-input"
                  name="progress_total"
                  value={numberInputValue(formData.progress_total)}
                  onChange={handleChange}
                  placeholder="0 if ongoing / unknown"
                />
              </div>
              <div className="form-group">
                <label htmlFor="media-rating">Rating (0-10)</label>
                <input
                  id="media-rating"
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  className="form-input"
                  name="rating"
                  value={numberInputValue(formData.rating)}
                  onChange={handleChange}
                  placeholder="0"
                />
              </div>
            </div>

            {formData.status === "Dropped" && (
              <div className="dropped-fields-group">
                <div className="modal-section-header">
                  <span>Dropped Details</span>
                </div>
                <div className="form-grid full">
                  <div className="form-group">
                    <label htmlFor="media-drop-reason">Drop Reason</label>
                    <input
                      id="media-drop-reason"
                      className="form-input"
                      name="drop_reason"
                      value={formData.drop_reason || ""}
                      onChange={handleChange}
                      placeholder="Why did you stop reading/watching?"
                    />
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      name="retry_flag"
                      checked={formData.retry_flag || false}
                      onChange={handleChange}
                    />
                    <span>Maybe revisit later?</span>
                  </label>
                </div>
              </div>
            )}

            {/* Section 3: Connections */}
            <div className="modal-section-header">
              <Globe size={15} />
              <span>Connections & Releases</span>
            </div>
            <div className="form-grid full">
              {isScreenMedia ? (
                <div className="form-group">
                  <label htmlFor="media-tracker-url">Watch URL (Optional)</label>
                  <input
                    id="media-tracker-url"
                    className="form-input"
                    name="tracker_url"
                    value={formData.tracker_url || ""}
                    onChange={handleChange}
                    placeholder="https://crunchyroll.com/... or your streaming link"
                  />
                  <div className="form-hint-row">
                    <Sparkles size={13} />
                    <small>
                      Anime and Donghua episode schedules sync automatically via SIMKL.
                    </small>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="media-tracker-url">Tracker URL (Optional)</label>
                    <input
                      id="media-tracker-url"
                      className="form-input"
                      name="tracker_url"
                      value={formData.tracker_url || ""}
                      onChange={handleChange}
                      placeholder="https://asuracomic.net/series/... or supported scraper URL"
                    />
                    {formData.media_type === "Manhwa" && (
                      <div className="tracker-test-row">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={handleTestTracker}
                          disabled={testingTracker || !formData.tracker_url}
                        >
                          {testingTracker ? <span className="spinner" /> : <LinkIcon size={13} />}
                          Test tracker
                        </button>
                        {trackerResult && <span className="tracker-test-output">{trackerResult}</span>}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="media-mangadex">MangaDex URL or ID (Optional)</label>
                    <input
                      id="media-mangadex"
                      className="form-input"
                      name="mangadex_id"
                      value={formData.mangadex_id || ""}
                      onChange={handleChange}
                      onBlur={normalizeMangaDexField}
                      placeholder="Paste title URL or UUID"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </>
              )}
            </div>

            {media && (
              <div className="linked-entries-section">
                <div className="modal-section-header">
                  <LinkIcon size={14} />
                  <span>Linked Entries</span>
                </div>
                <div className="linked-entry-panel">
                  <div className="linked-entry-list">
                    {linkedEntries.map((l) => (
                      <div key={l._id} className="linked-entry-chip">
                        <LinkIcon size={12} />
                        <span>{l.title}</span>
                        <button
                          type="button"
                          onClick={() => handleUnlink(l._id)}
                          aria-label={`Unlink ${l.title}`}
                          title="Unlink entry"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="linked-entry-search">
                    <input
                      className="form-input"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search other titles in library to link..."
                    />
                    {searchResults.length > 0 && (
                      <div className="linked-entry-results">
                        {searchResults.map((s) => {
                          let Icon = Book;
                          if (s.media_type === "Anime") Icon = Tv;
                          else if (s.media_type === "Donghua") Icon = Video;
                          else if (s.media_type === "Light Novel") Icon = BookOpen;

                          return (
                            <button
                              key={s._id}
                              type="button"
                              onClick={() => handleLink(s._id, s.title)}
                              className="linked-entry-result"
                            >
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
              </div>
            )}

            {/* Section 4: Organization & Details */}
            <div className="modal-section-header">
              <Layers size={15} />
              <span>Organization & Notes</span>
            </div>

            {shelves.length > 0 && (
              <div className="form-group">
                <label>Shelves</label>
                <div className="shelf-picker">
                  {shelves.map((s) => (
                    <label
                      key={s._id}
                      className="shelf-chip"
                      data-selected={selectedShelfIds.has(s._id) ? "true" : "false"}
                    >
                      <input
                        type="checkbox"
                        checked={selectedShelfIds.has(s._id)}
                        onChange={() => toggleShelf(s._id)}
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="form-grid full">
              <div className="form-group">
                <label htmlFor="media-custom-cover">Custom Cover Image URL (Optional)</label>
                <input
                  id="media-custom-cover"
                  className="form-input"
                  name="custom_cover_url"
                  value={formData.custom_cover_url || ""}
                  onChange={handleChange}
                  placeholder="https://... image link override"
                />
              </div>
              <div className="form-group">
                <label htmlFor="media-notes">Personal Notes</label>
                <textarea
                  id="media-notes"
                  className="form-input"
                  name="notes"
                  value={formData.notes || ""}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Thoughts, bookmarks, reading status..."
                />
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : media ? "Save changes" : "Add entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
