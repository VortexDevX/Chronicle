"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ArchiveX,
  BarChart3,
  BellRing,
  BookOpen,
  History,
  Home,
  Layers3,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";

const ROUTE_CONFIG: Record<
  string,
  {
    eyebrow: string;
    title: string;
    icon: React.ElementType;
  }
> = {
  "/home": {
    eyebrow: "Personal Command Center",
    title: "Home",
    icon: Home,
  },
  "/library": {
    eyebrow: "All Saved Titles",
    title: "Library",
    icon: BookOpen,
  },
  "/updates": {
    eyebrow: "Inbox & New Releases",
    title: "Updates",
    icon: BellRing,
  },
  "/queue": {
    eyebrow: "Upcoming Schedules",
    title: "Release Radar",
    icon: Sparkles,
  },
  "/droppedyard": {
    eyebrow: "Paused & Dropped Stories",
    title: "Droppedyard",
    icon: ArchiveX,
  },
  "/shelves": {
    eyebrow: "Curated Collections",
    title: "Shelves",
    icon: Layers3,
  },
  "/analytics": {
    eyebrow: "Personal Insights & Trends",
    title: "Analytics",
    icon: BarChart3,
  },
  "/cron-history": {
    eyebrow: "Automation & Tracker Health",
    title: "Cron History",
    icon: History,
  },
};

function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select") || target.isContentEditable;
}

export function TopBar({
  setMobileOpen,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  setMobileOpen: (value: boolean) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const pathname = usePathname();
  const openModal = useMediaStore((state) => state.openModal);
  const openSettings = useMediaStore((state) => state.openSettings);
  const setCommandOpen = useMediaStore((state) => state.setCommandOpen);
  const commandOpen = useMediaStore((state) => state.commandOpen);
  const modalOpen = useMediaStore((state) => state.modalOpen);
  const settingsOpen = useMediaStore((state) => state.settingsOpen);
  const username = useMediaStore((state) => state.username);

  const routeInfo = ROUTE_CONFIG[pathname] || {
    eyebrow: "Chronicle",
    title: "Workspace",
    icon: Home,
  };
  const RouteIcon = routeInfo.icon;
  const avatarLetter = username?.charAt(0).toUpperCase() || "C";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      if (
        e.key === "/" &&
        !isInputElement(e.target) &&
        !commandOpen &&
        !modalOpen &&
        !settingsOpen
      ) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandOpen, modalOpen, setCommandOpen, settingsOpen, onToggleSidebar]);

  return (
    <header className="topbar app-topbar">
      <div className="topbar-left">
        <button
          className="mobile-nav-trigger"
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
        </button>

        {onToggleSidebar && (
          <button
            type="button"
            className="topbar-sidebar-toggle desktop-only"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            title={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

        <div className="topbar-context-badge">
          <div className="topbar-route-icon-box">
            <RouteIcon size={18} />
          </div>
          <div className="topbar-copy">
            <span className="topbar-eyebrow">{routeInfo.eyebrow}</span>
            <h1 className="topbar-title">{routeInfo.title}</h1>
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          className="topbar-search-bar"
          onClick={() => setCommandOpen(true)}
          aria-label="Search your library (Press / or ⌘K)"
          title="Search your library (/ or ⌘K)"
        >
          <Search size={16} className="topbar-search-icon" />
          <span className="topbar-search-text">Search your library…</span>
          <div className="topbar-kbd-group">
            <kbd className="topbar-kbd">⌘</kbd>
            <kbd className="topbar-kbd">K</kbd>
          </div>
        </button>

        <button
          className="topbar-add-btn"
          onClick={() => openModal(null)}
          aria-label="Add new entry"
          title="Add entry (N)"
        >
          <Plus size={18} strokeWidth={2.5} />
          <span className="topbar-add-label">Add Entry</span>
        </button>

        <button
          className="topbar-user-chip"
          onClick={openSettings}
          title={username ? `${username} (Settings)` : "Chronicle Profile"}
          aria-label="Open profile settings"
        >
          <div className="topbar-avatar">{avatarLetter}</div>
          <span className="topbar-user-status-dot" />
        </button>
      </div>
    </header>
  );
}
