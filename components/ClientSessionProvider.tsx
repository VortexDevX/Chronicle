"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useMediaStore } from "@/store/mediaStore";
import { MediaModal } from "./MediaModal";
import { SettingsModal } from "./SettingsModal";
import { PageLoader } from "./PageLoader";
import { FeedbackProvider } from "./FeedbackProvider";
import { MediaDetails } from "./MediaDetails";
import { Dialog } from "./Dialog";
import { clearShelfPicker, loadShelfPicker } from "@/lib/client/shelfPicker";

export default function ClientSessionProvider({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const modalOpen = useMediaStore((state) => state.modalOpen);
  const modalMedia = useMediaStore((state) => state.modalMedia);
  const closeModal = useMediaStore((state) => state.closeModal);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const settingsOpen = useMediaStore((state) => state.settingsOpen);
  const closeSettings = useMediaStore((state) => state.closeSettings);
  const detailsMedia = useMediaStore((state) => state.detailsMedia);
  const closeDetails = useMediaStore((state) => state.closeDetails);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("chronicle_sidebar_collapsed");
      if (stored !== null) {
        setSidebarCollapsed(stored === "true");
      }
    } catch {
      // Ignore localStorage errors in restricted environments
    }
  }, []);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("chronicle_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const warm = () => { void loadShelfPicker().catch(() => {}); };
    const changed = () => { clearShelfPicker(); warm(); };
    warm(); window.addEventListener("chronicle-shelves-changed",changed);
    return () => window.removeEventListener("chronicle-shelves-changed",changed);
  }, [authStatus]);

  if (authStatus === "loading") {
    return (
      <div className="auth-bg">
        <PageLoader label="Opening Chronicle" detail="Checking your session" />
      </div>
    );
  }

  if (authStatus === "unauthenticated") return null;

  // We only want the shell wrapper for dashboard pages
  const isDashboard = pathname !== "/login" && pathname !== "/register";

  if (!isDashboard) return <>{children}</>;
  if (pathname.startsWith("/read/")) return <FeedbackProvider><main id="main-content">{children}</main></FeedbackProvider>;

  return (
    <FeedbackProvider>
      <a className="skip-to-content" href="#main-content">Skip to content</a>
      <div className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {mobileOpen ? <Dialog labelledBy="navigation-title" onClose={() => setMobileOpen(false)} className="navigation-dialog">
          <Sidebar mobileOpen setMobileOpen={setMobileOpen} collapsed={false} />
        </Dialog> : <Sidebar mobileOpen={false} setMobileOpen={setMobileOpen} collapsed={sidebarCollapsed} />}

        <main className="main" id="main-content" tabIndex={-1}>
          <TopBar
            setMobileOpen={setMobileOpen}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebarCollapse}
          />
          <div className="page-content">{children}</div>
        </main>

        <MobileBottomNav onOpenMobileMenu={() => setMobileOpen(true)} />

        {modalOpen && (
          <MediaModal
            media={modalMedia}
            onClose={closeModal}
            onSave={refreshMedia}
          />
        )}
        {settingsOpen && <SettingsModal onClose={closeSettings} />}
        {detailsMedia && <MediaDetails key={detailsMedia._id} media={detailsMedia} onClose={closeDetails} />}
      </div>
    </FeedbackProvider>
  );
}
