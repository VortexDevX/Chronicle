"use client";

import { useState, useEffect, useRef } from "react";
import { MediaItem, Shelf } from "@/types/media";
import type { UnifiedSearchResult } from "@/app/api/search/unified/route";
import {
  X,
  Link as LinkIcon,
  Tv,
  Book,
  Video,
  BookOpen,
  Info,
  Sliders,
  Layers,
  ChevronDown,
  Bookmark,
  Sparkles,
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
  Omit<
    MediaItem,
    "progress_current" | "progress_total" | "rating"
  >
> & {
  progress_current?: number | "";
  progress_total?: number | "";
  rating?: number | "";
  english_alias?: string;
  pinyin_alias?: string;
  hanzi_alias?: string;
};

const NUMBER_FIELDS = new Set([
  "progress_current",
  "progress_total",
  "rating",
]);

function getShelfMediaIds(shelf: Shelf): string[] {
  return Array.isArray(shelf.media_ids) ? shelf.media_ids.map(String) : [];
}

function numberInputValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeNumericFormFields(data: MediaFormData): Partial<MediaItem> {
  const aliases: { english?: string | null; pinyin?: string | null; hanzi?: string | null } = {};
  if (data.english_alias?.trim()) aliases.english = data.english_alias.trim();
  if (data.pinyin_alias?.trim()) aliases.pinyin = data.pinyin_alias.trim();
  if (data.hanzi_alias?.trim()) aliases.hanzi = data.hanzi_alias.trim();

  return {
    ...data,
    progress_current:
      data.progress_current === "" ? 0 : Number(data.progress_current || 0),
    progress_total:
      data.progress_total === "" ? 0 : Number(data.progress_total || 0),
    rating: data.rating === "" ? 0 : Number(data.rating || 0),
    ...(Object.keys(aliases).length > 0 ? { title_aliases: aliases } : {}),
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
    watch_url: "",
    mangadex_id: "",
    custom_cover_url: "",
    drop_reason: "",
    retry_flag: false,
    english_alias: "",
    pinyin_alias: "",
    hanzi_alias: "",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(new Set());
  const [originalShelfIds, setOriginalShelfIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [testingTracker, setTestingTracker] = useState(false);
  const [trackerResult, setTrackerResult] = useState("");
  const [error, setError] = useState("");

  // Suggestions Autocomplete state for media title
  const [titleSuggestions, setTitleSuggestions] = useState<UnifiedSearchResult[]>([]);
  const [isSearchingTitle, setIsSearchingTitle] = useState(false);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const titleSearchTimer = useRef<NodeJS.Timeout | null>(null);
  const titleWrapperRef = useRef<HTMLDivElement | null>(null);

  const [linkSearch, setLinkSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LinkSearchResult[]>([]);
  const [linkedEntries, setLinkedEntries] = useState<{ _id: string; title: string }[]>([]);

  useEffect(() => {
    if (media) {
      const initialData: MediaFormData = {
        ...media,
        tracker_url: media.tracker_url || "",
        watch_url: media.watch_url || media.tracker_url || "",
        english_alias: media.title_aliases?.english || "",
        pinyin_alias: media.title_aliases?.pinyin || "",
        hanzi_alias: media.title_aliases?.hanzi || "",
      };
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
        watch_url: "",
        mangadex_id: "",
        custom_cover_url: "",
        drop_reason: "",
        retry_flag: false,
        english_alias: "",
        pinyin_alias: "",
        hanzi_alias: "",
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
        if (items.length > 0 && media && media._id) {
          const activeIds = new Set<string>();
          items.forEach((s) => {
            if (getShelfMediaIds(s).includes(media._id)) activeIds.add(s._id);
          });
          setSelectedShelfIds(activeIds);
          setOriginalShelfIds(new Set(activeIds));
        }
      })
      .catch(() => {
        setShelves([]);
      });
  }, [media]);

  // Click outside to dismiss title suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        titleWrapperRef.current &&
        !titleWrapperRef.current.contains(e.target as Node)
      ) {
        setShowTitleDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (linkSearch.length > 2) {
      const t = setTimeout(() => {
        fetch(`/api/media?search=${encodeURIComponent(linkSearch)}&limit=10`, {
          cache: "no-store",
        })
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, title: val }));
    setSelectedSuggestionIndex(-1);

    if (val.trim().length >= 2) {
      if (titleSearchTimer.current) clearTimeout(titleSearchTimer.current);
      setIsSearchingTitle(true);
      titleSearchTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/search/unified?q=${encodeURIComponent(val.trim())}&type=all`,
            { cache: "no-store" },
          );
          const json = await res.json();
          if (json.data?.items && Array.isArray(json.data.items)) {
            setTitleSuggestions(json.data.items);
            setShowTitleDropdown(json.data.items.length > 0);
          } else {
            setTitleSuggestions([]);
            setShowTitleDropdown(false);
          }
        } catch {
          setTitleSuggestions([]);
          setShowTitleDropdown(false);
        } finally {
          setIsSearchingTitle(false);
        }
      }, 220);
    } else {
      setTitleSuggestions([]);
      setShowTitleDropdown(false);
      setIsSearchingTitle(false);
    }
  };

  const applySuggestion = (s: UnifiedSearchResult) => {
    setFormData((prev) => ({
      ...prev,
      title: s.title,
      media_type: s.mediaType,
      custom_cover_url: s.posterUrl || prev.custom_cover_url,
      anilist_id: s.anilistId || prev.anilist_id,
      mangadex_id: s.mangadexId || prev.mangadex_id,
      progress_total: s.totalEpisodes ?? prev.progress_total,
      english_alias: s.title,
      pinyin_alias:
        s.mediaType === "Donghua" && s.subtitle ? s.subtitle : prev.pinyin_alias,
      notes: s.subtitle ? `Alternate: ${s.subtitle}` : prev.notes,
    }));
    setShowTitleDropdown(false);
    setTitleSuggestions([]);
    toast(`Auto-filled details for "${s.title}"`, "success");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showTitleDropdown || titleSuggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < titleSuggestions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : titleSuggestions.length - 1,
      );
    } else if (e.key === "Enter" && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      const selected = titleSuggestions[selectedSuggestionIndex];
      if (selected) applySuggestion(selected);
    } else if (e.key === "Escape") {
      setShowTitleDropdown(false);
    }
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
    } else if (name === "media_type") {
      setFormData((prev) => ({
        ...prev,
        media_type: value,
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

  const handleTestTracker = async () => {
    const targetUrl = (formData.tracker_url || formData.watch_url || "").trim();
    if (!targetUrl) return;
    setTestingTracker(true);
    setError("");
    setTrackerResult("");

    try {
      const res = await fetch("/api/media/test-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: media?._id,
          tracker_url: targetUrl,
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

  const handleLink = async (targetId: string, title: string) => {
    if (!media || !media._id) {
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
    if (!media || !media._id) return;
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
      const isExisting = Boolean(media && media._id);
      const method = isExisting ? "PUT" : "POST";
      const url = isExisting ? `/api/media?id=${media!._id}` : "/api/media";

      const cleanData: Record<string, unknown> = {
        ...normalizeNumericFormFields(formData),
      };
      delete cleanData.english_alias;
      delete cleanData.pinyin_alias;
      delete cleanData.hanzi_alias;

      if (cleanData.watch_url && !cleanData.tracker_url) {
        cleanData.tracker_url = cleanData.watch_url;
      }
      if (cleanData.tracker_url && !cleanData.watch_url) {
        cleanData.watch_url = cleanData.tracker_url;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save");
      }

      const mediaId = isExisting ? media!._id : data.data?._id;

      // Update shelves if changed
      if (mediaId) {
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
      }

      onSave();
      toast(isExisting ? "Entry updated" : "Entry added", "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
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

  const isExisting = Boolean(media && media._id);

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
          {isExisting ? "Edit Entry" : "Add Entry"}
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-scroll">
            {/* Essentials Section */}
            <div className="modal-section-header">
              <Info size={15} />
              <span>Essentials</span>
            </div>

            {/* Title with live search suggestions dropdown */}
            <div className="form-grid full">
              <div className="form-group title-search-wrapper" ref={titleWrapperRef}>
                <label htmlFor="media-title">Title</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="media-title"
                    className="form-input"
                    required
                    name="title"
                    value={formData.title || ""}
                    onChange={handleTitleChange}
                    onKeyDown={handleTitleKeyDown}
                    onFocus={() => {
                      if (titleSuggestions.length > 0) setShowTitleDropdown(true);
                    }}
                    placeholder="Search name for suggestions (e.g. Solo Leveling, Soul Land, Frieren)"
                    autoComplete="off"
                  />
                  {isSearchingTitle && (
                    <span
                      className="spinner"
                      style={{
                        width: 14,
                        height: 14,
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                      }}
                    />
                  )}
                </div>

                {showTitleDropdown && titleSuggestions.length > 0 && (
                  <div className="title-suggestions-dropdown" role="listbox">
                    {titleSuggestions.map((s, idx) => {
                      const typeClass = s.mediaType.toLowerCase();
                      const isSelected = selectedSuggestionIndex === idx;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`title-suggestion-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => applySuggestion(s)}
                          onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                        >
                          {s.posterUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={s.posterUrl}
                              alt=""
                              className="title-suggestion-poster"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="title-suggestion-poster"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Sparkles size={13} />
                            </div>
                          )}
                          <div className="title-suggestion-info">
                            <span className="title-suggestion-main">{s.title}</span>
                            {s.subtitle && (
                              <span className="title-suggestion-sub">{s.subtitle}</span>
                            )}
                          </div>
                          <div className="title-suggestion-meta">
                            <span className={`title-suggestion-tag ${typeClass}`}>
                              {s.mediaType}
                            </span>
                            {s.totalEpisodes && (
                              <span className="title-suggestion-tag">
                                {s.totalEpisodes} {s.mediaType === "Manhwa" ? "chs" : "eps"}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
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
                  <option value="Donghua">Donghua</option>
                  <option value="Manhwa">Manhwa</option>
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
                <label htmlFor="media-progress-total">Total (Optional)</label>
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
                  placeholder="0 if ongoing"
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

            {/* Direct Watch / Reading Bookmark */}
            <div className="form-grid full">
              {formData.media_type === "Manhwa" || formData.media_type === "Donghua" ? (
                <div className="form-group">
                  <label htmlFor="media-tracker-url">
                    <LinkIcon size={13} style={{ display: "inline", marginRight: 4 }} />
                    Tracker URL (Supported Scrapers)
                  </label>
                  <input
                    id="media-tracker-url"
                    className="form-input"
                    name="tracker_url"
                    value={formData.tracker_url || ""}
                    onChange={handleChange}
                    placeholder={
                      formData.media_type === "Donghua"
                        ? "https://animexin.dev/... or donghua episode url"
                        : "https://asuracomic.net/... or flamecomics.xyz/..."
                    }
                  />
                  <div className="tracker-test-row">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={handleTestTracker}
                      disabled={testingTracker || (!formData.tracker_url && !formData.watch_url)}
                    >
                      {testingTracker ? <span className="spinner" /> : <LinkIcon size={13} />}
                      Test tracker
                    </button>
                    {trackerResult && <span className="tracker-test-output">{trackerResult}</span>}
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="media-watch-url">
                    <Bookmark size={13} style={{ display: "inline", marginRight: 4 }} />
                    Watch / Read Link (Optional)
                  </label>
                  <input
                    id="media-watch-url"
                    className="form-input"
                    name="watch_url"
                    value={formData.watch_url || ""}
                    onChange={handleChange}
                    placeholder="e.g. Crunchyroll or reader bookmark"
                  />
                </div>
              )}
            </div>

            {/* Shelves - prominent in main essentials view */}
            {shelves.length > 0 && (
              <div className="form-group" style={{ marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={13} />
                  <span>Shelves</span>
                </label>
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

            {/* Collapsible Advanced Drawer */}
            <button
              type="button"
              className="advanced-drawer-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={15} />
                <span>Advanced Settings & Aliases</span>
              </div>
              <ChevronDown
                size={16}
                style={{
                  transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {showAdvanced && (
              <div className="advanced-drawer-content">
                {/* Title Aliases for Donghua & Multi-language */}
                <div className="modal-section-header">
                  <BookOpen size={14} />
                  <span>Alternate Title Aliases</span>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="alias-english">English Title</label>
                    <input
                      id="alias-english"
                      className="form-input"
                      name="english_alias"
                      value={formData.english_alias || ""}
                      onChange={handleChange}
                      placeholder="e.g. Battle Through the Heavens"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="alias-pinyin">Pinyin (Romanized)</label>
                    <input
                      id="alias-pinyin"
                      className="form-input"
                      name="pinyin_alias"
                      value={formData.pinyin_alias || ""}
                      onChange={handleChange}
                      placeholder="e.g. Doupo Cangqiong"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="alias-hanzi">Hanzi (Chinese)</label>
                    <input
                      id="alias-hanzi"
                      className="form-input"
                      name="hanzi_alias"
                      value={formData.hanzi_alias || ""}
                      onChange={handleChange}
                      placeholder="e.g. 斗破苍穹"
                    />
                  </div>
                </div>

                {/* MangaDex Integration (For Manhwa/Manga) */}
                {formData.media_type !== "Donghua" && (
                  <div className="form-grid full">
                    <div className="form-group">
                      <label htmlFor="media-mangadex">MangaDex URL or Title ID</label>
                      <input
                        id="media-mangadex"
                        className="form-input"
                        name="mangadex_id"
                        value={formData.mangadex_id || ""}
                        onChange={handleChange}
                        onBlur={normalizeMangaDexField}
                        placeholder="Paste MangaDex title URL or UUID"
                      />
                    </div>
                  </div>
                )}

                {/* Cover Image & Personal Notes */}
                <div className="form-grid full">
                  <div className="form-group">
                    <label htmlFor="media-custom-cover">Custom Cover Image URL</label>
                    <input
                      id="media-custom-cover"
                      className="form-input"
                      name="custom_cover_url"
                      value={formData.custom_cover_url || ""}
                      onChange={handleChange}
                      placeholder="https://... cover image override"
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
                      placeholder="Notes, thoughts, or custom remarks..."
                    />
                  </div>
                </div>

                {/* Linked Entries */}
                {isExisting && (
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
                          placeholder="Search other library titles to link..."
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
              </div>
            )}

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
              {loading ? <span className="spinner" /> : isExisting ? "Save changes" : "Add entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
