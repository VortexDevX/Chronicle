import { motionDisabled } from "./motionPreference";

export type ColorTheme = "light" | "dark";
export const THEME_KEY = "chronicle_theme";
export const THEME_EVENT = "chronicle-theme-change";
export const THEME_BOOTSTRAP = `try{document.documentElement.dataset.theme=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}`;
let transition: ViewTransition | undefined;
let requested: ColorTheme | undefined;
let generation = 0;

export function getTheme(): ColorTheme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ColorTheme, persist = true) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#19151f" : "#f7f5f0");
  if (persist) try { localStorage.setItem(THEME_KEY, theme); } catch { /* The current page still changes when storage is blocked. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

export function toggleTheme() {
  const next = (requested ?? getTheme()) === "dark" ? "light" : "dark";
  const version = ++generation;
  requested = next;
  transition?.skipTransition();
  const root = document.documentElement;
  const finish = () => {
    if (version !== generation) return;
    requested = undefined;
    transition = undefined;
    delete root.dataset.themeTransition;
  };
  const update = () => { if (version === generation) applyTheme(next); };
  const reduced = motionDisabled() || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof document.startViewTransition !== "function") {
    update();
    if (!reduced) {
      root.dataset.themeTransition = "fade";
      window.setTimeout(finish, 240);
    } else finish();
    return;
  }
  root.dataset.themeTransition = "panels";
  try {
    transition = document.startViewTransition(update);
    void transition.ready.catch(() => {});
    void transition.finished.then(finish, () => { update(); finish(); });
  } catch { update(); finish(); }
}
