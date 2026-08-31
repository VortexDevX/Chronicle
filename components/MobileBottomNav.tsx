"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  BookOpen,
  Home,
  Menu,
  Sparkles,
} from "lucide-react";

export function MobileBottomNav({
  onOpenMobileMenu,
}: {
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();

  const navLinks = [
    { path: "/home", label: "Home", icon: Home },
    { path: "/library", label: "Library", icon: BookOpen },
    { path: "/updates", label: "Updates", icon: BellRing },
    { path: "/queue", label: "Radar", icon: Sparkles },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
      <div className="mobile-bottom-nav-inner">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`mobile-nav-item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className="mobile-nav-item mobile-nav-more"
          onClick={onOpenMobileMenu}
          aria-label="Open menu for shelves, graveyard, and settings"
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
