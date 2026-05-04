"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMediaStore } from "@/store/mediaStore";
import { useState } from "react";
import { BookOpen, ListTodo, ArchiveX, Library, BarChart2, Plus, Download, Upload, LogOut, Settings, ChevronDown, FileJson, FileText } from "lucide-react";

export function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const pathname = usePathname();
  const username = useMediaStore((state) => state.username);
  const setAuth = useMediaStore((state) => state.setAuth);
  const openModal = useMediaStore((state) => state.openModal);
  const openSettings = useMediaStore((state) => state.openSettings);
  const avatarLetters = username?.substring(0, 2).toUpperCase() || "??";
  const [exportOpen, setExportOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      setAuth("unauthenticated");
    } catch {}
  };

  const handleExportJSON = async () => {
    try {
      const res = await fetch("/api/media?limit=9999");
      const json = await res.json();
      const dataStr = JSON.stringify(json.data?.items || [], null, 2);
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
      const exportFileDefaultName = "chronicle_export.json";
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    } catch {
      alert("Export failed");
    }
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(data)) throw new Error("Invalid format");
          let success = 0;
          for (const item of data) {
            const { _id, ...rest } = item;
            await fetch('/api/media', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rest)
            });
            success++;
          }
          alert(`Successfully imported ${success} items. Please refresh.`);
        } catch {
          alert("Import failed");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const navItems = [
    { 
      path: "/library", 
      label: "Library", 
      icon: <BookOpen size={16} />
    },
    { 
      path: "/queue", 
      label: "Queue", 
      icon: <ListTodo size={16} />
    },
    { 
      path: "/droppedyard", 
      label: "Droppedyard", 
      icon: <ArchiveX size={16} />
    },
    { 
      path: "/shelves", 
      label: "Shelves", 
      icon: <Library size={16} />
    },
    { 
      path: "/analytics", 
      label: "Analytics", 
      icon: <BarChart2 size={16} />
    },
  ];

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} role="navigation" aria-label="Main navigation">
      <div className="sidebar-brand">
        <Image src="/favicon.png" alt="Chronicle logo" width={32} height={32} className="sidebar-brand-logo" />
        <h1>Chronicle</h1>
      </div>

      <div className="sidebar-nav">
        <button className="btn-primary" onClick={() => openModal(null)} style={{ marginBottom: "24px" }}>
          <Plus size={16} strokeWidth={3} />
          <span>Add Entry</span>
        </button>

        <div className="sidebar-nav-group">
          {navItems.map((item) => (
            <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)} style={{ textDecoration: "none" }}
              className={`sidebar-link ${pathname === item.path ? "nav-active" : ""}`}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-divider"></div>

        <button className="sidebar-link" onClick={handleImportJSON}>
          <Download size={16} />
          <span>Import JSON</span>
        </button>

        <button className="sidebar-link" onClick={handleExportJSON}>
          <Upload size={16} />
          <span>Export JSON</span>
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{avatarLetters}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{username}</div>
          </div>
        </div>
        <div className="sidebar-user-actions">
          <button className="btn-ghost sidebar-footer-btn" onClick={openSettings} title="Settings">
            <Settings size={14} />
            Settings
          </button>
          <button className="btn-ghost sidebar-footer-btn" onClick={handleLogout} title="Logout">
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
