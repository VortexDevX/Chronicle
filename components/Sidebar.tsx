"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArchiveX,
  BarChart3,
  BellRing,
  BookOpen,
  Home,
  Layers3,
  ListTodo,
  LogOut,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";

const NAV_ITEMS = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/library", label: "Library", icon: BookOpen },
  { path: "/updates", label: "Updates", icon: BellRing },
  { path: "/queue", label: "Queue", icon: ListTodo },
  { path: "/droppedyard", label: "Droppedyard", icon: ArchiveX },
  { path: "/shelves", label: "Shelves", icon: Layers3 },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function Sidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const username = useMediaStore((state) => state.username);
  const setAuth = useMediaStore((state) => state.setAuth);
  const openModal = useMediaStore((state) => state.openModal);
  const openSettings = useMediaStore((state) => state.openSettings);
  const { toast } = useFeedback();
  const avatarLetter = username?.charAt(0).toUpperCase() || "C";

  const logout = async () => {
    try {
      await apiRequest("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setAuth("unauthenticated");
      router.push("/login");
    } catch {
      toast("Could not sign out. Try again.", "error");
    }
  };

  return (
    <aside className={`sidebar app-rail ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="rail-brand">
        <Image
          src="/favicon.png"
          alt="Chronicle"
          width={28}
          height={28}
          priority
        />
        <span>Chronicle</span>
        <button
          className="rail-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>
      </div>

      <button
        className="rail-add"
        onClick={() => openModal(null)}
        aria-label="Add entry"
      >
        <Plus size={20} />
        <span>Add entry</span>
      </button>

      <nav className="rail-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="rail-footer">
        <button onClick={openSettings} title="Settings">
          <Settings size={18} />
          <span>Settings</span>
        </button>
        <button onClick={logout} title="Logout">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
        <div className="rail-avatar" title={username || "Chronicle user"}>
          {avatarLetter}
          <i />
          <span>{username}</span>
        </div>
      </div>
    </aside>
  );
}
