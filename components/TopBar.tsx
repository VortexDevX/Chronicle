"use client";

import { usePathname } from "next/navigation";
import { useMediaStore } from "@/store/mediaStore";
import { Menu, Plus } from "lucide-react";

export function TopBar({ setMobileOpen }: { setMobileOpen: (v: boolean) => void }) {
  const pathname = usePathname();
  const openModal = useMediaStore((state) => state.openModal);
  
  const routeNames: Record<string, string> = {
    "/library": "Library",
    "/queue": "Queue",
    "/droppedyard": "Droppedyard",
    "/shelves": "Shelves",
    "/analytics": "Analytics",
  };
  
  const title = routeNames[pathname] || "Dashboard";

  return (
    <header className="topbar">
      <button className="btn-ghost mobile-only-btn" aria-label="Open Menu" onClick={() => setMobileOpen(true)}>
        <Menu size={22} />
      </button>
      <div className="topbar-title">{title}</div>
    </header>
  );
}
