"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/.test(ua)) return "desktop";
  return "unknown";
}

/**
 * Hook that exposes PWA install capability across all platforms.
 * - Chromium: captures beforeinstallprompt for native prompt
 * - iOS Safari: returns manual instructions (no API exists)
 * - Already installed: reports isInstalled
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());

    // Already running as installed PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone
    ) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detect if user installed mid-session
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mediaQuery.addEventListener("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mediaQuery.removeEventListener("change", onDisplayChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (outcome === "accepted") {
      setIsInstalled(true);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  /** True when native install prompt is available (Chromium) */
  const hasNativePrompt = deferredPrompt !== null;

  /** True when we should show install UI (not installed + not in standalone) */
  const showInstall = !isInstalled;

  return {
    showInstall,
    hasNativePrompt,
    isInstalled,
    platform,
    install,
  };
}
