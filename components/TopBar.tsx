"use client";

import { usePathname } from "next/navigation";
import { Menu, Plus, Search } from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";

const ROUTE_META: Record<string, { eyebrow: string; title: string }> = {
  "/home": { eyebrow: "Your space", title: "Home" },
  "/library": { eyebrow: "All saved titles", title: "Library" },
  "/updates": { eyebrow: "New episodes and chapters", title: "Updates" },
  "/queue": { eyebrow: "Saved for later", title: "Queue" },
  "/droppedyard": { eyebrow: "Paused stories", title: "Droppedyard" },
  "/shelves": { eyebrow: "Curated collections", title: "Shelves" },
  "/analytics": { eyebrow: "Your watching and reading", title: "Analytics" },
};

export function TopBar({
  setMobileOpen,
}: {
  setMobileOpen: (value: boolean) => void;
}) {
  const pathname = usePathname();
  const openModal = useMediaStore((state) => state.openModal);
  const setCommandOpen = useMediaStore((state) => state.setCommandOpen);
  const meta = ROUTE_META[pathname] || { eyebrow: "Chronicle", title: "Workspace" };

  return (
    <header className="topbar app-topbar">
      <button
        className="mobile-nav-trigger"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={21} />
      </button>
      <div className="topbar-copy">
        <span>{meta.eyebrow}</span>
        <h1>{meta.title}</h1>
      </div>
      <div className="topbar-actions">
        <button className="topbar-search" onClick={() => setCommandOpen(true)}>
          <Search size={17} />
          <span>Search your library</span>
          <kbd>⌘ K</kbd>
        </button>
        <button className="topbar-add" onClick={() => openModal(null)}>
          <Plus size={18} />
          <span>Add</span>
        </button>
      </div>
    </header>
  );
}
