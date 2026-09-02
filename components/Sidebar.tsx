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
  History,
  Layers3,
  LogOut,
  Settings,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";

export const NAV_GROUPS = [
  {
    title: "MAIN",
    items: [
      { path: "/home", label: "Home", icon: Home },
      { path: "/library", label: "Library", icon: BookOpen },
      { path: "/updates", label: "Updates", icon: BellRing },
      { path: "/queue", label: "Release Radar", icon: Sparkles },
    ],
  },
  {
    title: "LIBRARY",
    items: [
      { path: "/shelves", label: "Shelves", icon: Layers3 },
      { path: "/droppedyard", label: "Droppedyard", icon: ArchiveX },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      { path: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { path: "/cron-history", label: "Cron history", icon: History },
    ],
  },
] as const;

export function Sidebar({
  mobileOpen,
  setMobileOpen,
  collapsed = false,
}: {
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const username = useMediaStore((state) => state.username);
  const setAuth = useMediaStore((state) => state.setAuth);
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
    <aside
      className={`sidebar app-rail ${mobileOpen ? "mobile-open" : ""} ${collapsed ? "is-collapsed" : "is-expanded"}`}
      aria-label="Sidebar navigation"
    >
      <div className="rail-brand">
        <Link href="/home" className="rail-brand-link" onClick={() => setMobileOpen(false)}>
          <Image
            src="/favicon.png"
            alt="Chronicle"
            width={28}
            height={28}
            priority
          />
          <span className="rail-brand-text">Chronicle</span>
        </Link>

        <button
          className="rail-close mobile-only"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>
      </div>

      <nav className="rail-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="rail-group">
            <span className="rail-group-title">{group.title}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`rail-link ${active ? "is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={19} />
                  <span className="rail-link-text">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="rail-footer">
        <a
          href="/downloads/chronicle.apk"
          download="chronicle.apk"
          className="rail-footer-btn"
          title="Download Android App (APK)"
          aria-label="Download Android App"
          onClick={() => setMobileOpen(false)}
        >
          <Smartphone size={19} />
          <span className="rail-footer-text">Android App</span>
        </a>
        <button
          className="rail-footer-btn"
          onClick={() => {
            setMobileOpen(false);
            openSettings();
          }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={19} />
          <span className="rail-footer-text">Settings</span>
        </button>
        <button
          className="rail-footer-btn"
          onClick={logout}
          title="Logout"
          aria-label="Sign out of Chronicle"
        >
          <LogOut size={19} />
          <span className="rail-footer-text">Logout</span>
        </button>
        <div className="rail-user-card" title={username || "Chronicle user"}>
          <div className="rail-user-avatar">
            {avatarLetter}
            <span className="rail-user-dot" />
          </div>
          <span className="rail-user-name">{username || "Chronicle user"}</span>
        </div>
      </div>
    </aside>
  );
}
