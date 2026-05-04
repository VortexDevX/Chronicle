"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useMediaStore } from "@/store/mediaStore";
import { MediaModal } from "./MediaModal";
import { SettingsModal } from "./SettingsModal";

export default function ClientSessionProvider({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const modalOpen = useMediaStore((state) => state.modalOpen);
  const modalMedia = useMediaStore((state) => state.modalMedia);
  const closeModal = useMediaStore((state) => state.closeModal);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const settingsOpen = useMediaStore((state) => state.settingsOpen);
  const closeSettings = useMediaStore((state) => state.closeSettings);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  if (authStatus === "loading") {
    return (
      <div className="auth-bg">
        <div className="loading-state"><span className="spinner" /> Loading...</div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") return null;

  // We only want the shell wrapper for dashboard pages
  const isDashboard = pathname !== "/login" && pathname !== "/register";

  if (!isDashboard) return <>{children}</>;

  return (
    <div className="shell">
      {mobileOpen && <div id="sidebar-overlay" className="sidebar-overlay active" onClick={() => setMobileOpen(false)}></div>}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      
      <main className="main">
        <TopBar setMobileOpen={setMobileOpen} />
        <div className="page-content">
          {children}
        </div>
      </main>

      {modalOpen && (
        <MediaModal
          media={modalMedia}
          onClose={closeModal}
          onSave={refreshMedia}
        />
      )}
      {settingsOpen && (
        <SettingsModal onClose={closeSettings} />
      )}
    </div>
  );
}
