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
      setSelected(0);
      return;
    }
    const normalized = query.trim();
    if (normalized.length < 2) {
      setMedia([]);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest<{ items: MediaItem[] }>(
          `/api/media?search=${encodeURIComponent(normalized)}&limit=5`,
          { cache: "no-store" },
        );
        if (currentRequest === requestId.current) {
          setMedia(payload.items || []);
        }
      } catch {
        if (currentRequest === requestId.current) setMedia([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const actions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ACTIONS.filter((action) =>
      action.label.toLowerCase().includes(normalized),
    );
  }, [query]);

  const resultCount = actions.length + media.length;

  const runAction = (action: CommandAction) => {
    if ("path" in action) router.push(action.path);
    if ("action" in action && action.action === "add") openModal(null);
    if ("action" in action && action.action === "settings") openSettings();
    setOpen(false);
  };

  const runSelected = () => {
    if (selected < actions.length) {
      runAction(actions[selected]);
      return;
    }
    const item = media[selected - actions.length];
    if (item) {
      openModal(item);
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay palette-overlay" onMouseDown={() => setOpen(false)}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
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
            placeholder="Search your library or run a command…"
          />
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
          {resultCount === 0 && (
            <div className="palette-empty">No matching command or title.</div>
          )}
        </div>
        <footer>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </footer>
      </section>
    </div>
  );
}
