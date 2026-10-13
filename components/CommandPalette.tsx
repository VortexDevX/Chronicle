"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveX,
  BarChart3,
  BellRing,
  BookOpen,
  CornerDownLeft,
  Home,
  History,
  Layers3,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest } from "@/lib/client/api";
import type { MediaItem } from "@/types/media";
import type { UnifiedSearchResult } from "@/app/api/search/unified/route";

const ACTIONS = [
  { id: "home", label: "Open Home", hint: "Page", icon: Home, path: "/home" },
  { id: "library", label: "Open Library", hint: "Page", icon: BookOpen, path: "/library" },
  { id: "updates", label: "Open Updates", hint: "Page", icon: BellRing, path: "/updates" },
  { id: "queue", label: "Open Release Radar", hint: "Page", icon: Sparkles, path: "/queue" },
  { id: "shelves", label: "Open Shelves", hint: "Page", icon: Layers3, path: "/shelves" },
  { id: "droppedyard", label: "Open Droppedyard", hint: "Page", icon: ArchiveX, path: "/droppedyard" },
  { id: "analytics", label: "Open Analytics", hint: "Page", icon: BarChart3, path: "/analytics" },
  { id: "cron-history", label: "Open Cron history", hint: "Page", icon: History, path: "/cron-history" },
  { id: "add", label: "Add new entry", hint: "Action", icon: Plus, action: "add" },
  { id: "settings", label: "Open Settings", hint: "Action", icon: Settings, action: "settings" },
] as const;

type CommandAction = (typeof ACTIONS)[number];

function acceptsTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches("input, textarea, select") ||
    target.isContentEditable
  );
}

export function CommandPalette() {
  const router = useRouter();
  const open = useMediaStore((state) => state.commandOpen);
  const setOpen = useMediaStore((state) => state.setCommandOpen);
  const modalOpen = useMediaStore((state) => state.modalOpen);
  const settingsOpen = useMediaStore((state) => state.settingsOpen);
  const openModal = useMediaStore((state) => state.openModal);
  const openSettings = useMediaStore((state) => state.openSettings);
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [discoverItems, setDiscoverItems] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
        return;
      }
      if (
        event.key.toLowerCase() === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !acceptsTextInput(event.target) &&
        !open &&
        !modalOpen &&
        !settingsOpen
      ) {
        event.preventDefault();
        openModal(null);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [modalOpen, open, openModal, setOpen, settingsOpen]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMedia([]);
      setDiscoverItems([]);
      setSelected(0);
      setIsSearching(false);
      return;
    }
    const normalized = query.trim();
    if (normalized.length < 2) {
      setMedia([]);
      setDiscoverItems([]);
      setIsSearching(false);
      return;
    }

    const currentRequest = ++requestId.current;
    setIsSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const [libraryRes, discoverRes] = await Promise.allSettled([
          apiRequest<{ items: MediaItem[] }>(
            `/api/media?search=${encodeURIComponent(normalized)}&limit=5`,
            { cache: "no-store" },
          ),
          apiRequest<{ items: UnifiedSearchResult[] }>(
            `/api/search/unified?q=${encodeURIComponent(normalized)}`,
            { cache: "no-store" },
          ),
        ]);

        if (currentRequest === requestId.current) {
          const libraryItems =
            libraryRes.status === "fulfilled" ? libraryRes.value.items || [] : [];
          setMedia(libraryItems);

          if (discoverRes.status === "fulfilled") {
            const rawDiscover = discoverRes.value.items || [];
            const existingTitles = new Set(
              libraryItems.map((m) => m.title.toLowerCase().trim()),
            );
            const fresh = rawDiscover.filter(
              (d) => !existingTitles.has(d.title.toLowerCase().trim()),
            );
            setDiscoverItems(fresh.slice(0, 6));
          } else {
            setDiscoverItems([]);
          }
        }
      } catch {
        if (currentRequest === requestId.current) {
          setMedia([]);
          setDiscoverItems([]);
        }
      } finally {
        if (currentRequest === requestId.current) {
          setIsSearching(false);
        }
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const actions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ACTIONS.filter((action) =>
      action.label.toLowerCase().includes(normalized),
    );
  }, [query]);

  const resultCount = actions.length + media.length + discoverItems.length;

  const runAction = (action: CommandAction) => {
    if ("path" in action) router.push(action.path);
    if ("action" in action && action.action === "add") openModal(null);
    if ("action" in action && action.action === "settings") openSettings();
    setOpen(false);
  };

  const handleTrackDiscover = (item: UnifiedSearchResult) => {
    openModal({
      _id: "",
      title: item.title,
      media_type: item.mediaType,
      status: "Active",
      progress_current: 0,
      progress_total: item.totalEpisodes || 0,
      rating: 0,
      notes: item.subtitle ? `Alternate: ${item.subtitle}` : "",
      custom_cover_url: item.posterUrl || "",
      anilist_id: item.anilistId || null,
      mangadex_id: item.mangadexId || null,
      tracking_source: item.source === "anilist" ? "anilist" : null,
      numbering_mode:
        item.mediaType === "Anime" || item.mediaType === "Donghua"
          ? "seasonal"
          : "continuous",
      season_number: 1,
      episode_offset: 0,
      numbering_status: "verified",
      title_aliases: item.subtitle
        ? {
            english: item.title,
            pinyin: null,
            hanzi: null,
            custom: [item.subtitle],
          }
        : null,
      last_updated: new Date().toISOString(),
    });
    setOpen(false);
  };

  const runSelected = () => {
    if (selected < actions.length) {
      runAction(actions[selected]);
      return;
    }
    const mediaIndex = selected - actions.length;
    if (mediaIndex < media.length) {
      const item = media[mediaIndex];
      if (item) {
        openModal(item);
        setOpen(false);
      }
      return;
    }
    const discoverIndex = mediaIndex - media.length;
    const discoverItem = discoverItems[discoverIndex];
    if (discoverItem) {
      handleTrackDiscover(discoverItem);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay palette-overlay" onMouseDown={() => setOpen(false)}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Omnisearch command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected((value) => (resultCount ? (value + 1) % resultCount : 0));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected((value) =>
              resultCount ? (value - 1 + resultCount) % resultCount : 0,
            );
          }
          if (event.key === "Enter" && resultCount) {
            event.preventDefault();
            runSelected();
          }
        }}
      >
        <div className="palette-search">
          <Search size={19} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            placeholder="Search library, discover titles, or run command… (⌘K)"
          />
          {isSearching && <span className="spinner" style={{ width: 14, height: 14 }} />}
          <button onClick={() => setOpen(false)} aria-label="Close command palette">
            <X size={17} />
          </button>
        </div>
        <div className="palette-results">
          {actions.length > 0 && (
            <div className="palette-group">
              <span>Commands</span>
              {actions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    className={selected === index ? "is-selected" : ""}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => runAction(action)}
                  >
                    <Icon size={17} />
                    <strong>{action.label}</strong>
                    <small>{action.hint}</small>
                    <CornerDownLeft size={13} />
                  </button>
                );
              })}
            </div>
          )}

          {media.length > 0 && (
            <div className="palette-group">
              <span>Library</span>
              {media.map((item, index) => {
                const resultIndex = actions.length + index;
                return (
                  <button
                    key={item._id}
                    className={selected === resultIndex ? "is-selected" : ""}
                    onMouseEnter={() => setSelected(resultIndex)}
                    onClick={() => {
                      openModal(item);
                      setOpen(false);
                    }}
                  >
                    <i>{item.title.charAt(0)}</i>
                    <strong>{item.title}</strong>
                    <small>{item.media_type} · {item.status}</small>
                    <CornerDownLeft size={13} />
                  </button>
                );
              })}
            </div>
          )}

          {discoverItems.length > 0 && (
            <div className="palette-group">
              <span>Discover & Track (AniList & MangaDex)</span>
              {discoverItems.map((item, index) => {
                const resultIndex = actions.length + media.length + index;
                const typeClass = item.mediaType.toLowerCase();
                return (
                  <button
                    key={item.id}
                    className={`palette-discover-item ${selected === resultIndex ? "is-selected" : ""}`}
                    onMouseEnter={() => setSelected(resultIndex)}
                    onClick={() => handleTrackDiscover(item)}
                  >
                    {item.posterUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="palette-discover-poster"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="palette-discover-poster"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Sparkles size={14} />
                      </div>
                    )}
                    <div className="palette-discover-info">
                      <strong className="palette-discover-title">{item.title}</strong>
                      {item.subtitle && (
                        <small className="palette-discover-sub">{item.subtitle}</small>
                      )}
                    </div>
                    <span className={`palette-badge ${typeClass}`}>{item.mediaType}</span>
                    <Plus size={14} style={{ opacity: 0.7 }} />
                  </button>
                );
              })}
            </div>
          )}

          {resultCount === 0 && !isSearching && (
            <div className="palette-empty">No matching command, library title, or discover result.</div>
          )}
        </div>
        <footer>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select & Track</span>
          <span><kbd>esc</kbd> Close</span>
        </footer>
      </section>
    </div>
  );
}
