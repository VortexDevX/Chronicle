"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getTheme, subscribeTheme, THEME_KEY, toggleTheme } from "@/lib/client/theme";

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");
  const action = theme === "dark" ? "light" : "dark";
  return <button type="button" className={`theme-toggle${showLabel ? " theme-toggle-labeled" : ""}`} aria-label={`Switch to ${action} mode`} title={`Switch to ${action} mode`} onClick={() => toggleTheme()}>{theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}{showLabel && <span>{action === "dark" ? "Dark mode" : "Light mode"}</span>}</button>;
}

export function ThemePreference() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");
  return <div className="theme-preference"><div><strong>Color theme</strong><p>{theme === "dark" ? "Dusk & Lilac" : "Paper & Lilac"}</p></div><ThemeToggle showLabel /></div>;
}

export function ThemeSync() {
  useEffect(() => {
    applyTheme(getTheme(), false);
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) applyTheme(event.newValue === "dark" ? "dark" : "light", false);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return null;
}
