export const MOTION_KEY = "chronicle_motion";
export const MOTION_EVENT = "chronicle-motion-change";
let fallbackDisabled = false;

export function motionDisabled() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MOTION_KEY) === "reduced";
  } catch {
    return fallbackDisabled;
  }
}

export function subscribeMotion(listener: () => void) {
  window.addEventListener(MOTION_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(MOTION_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function setMotionDisabled(disabled: boolean) {
  fallbackDisabled = disabled;
  try {
    localStorage.setItem(MOTION_KEY, disabled ? "reduced" : "full");
  } catch {
    // The current page still respects the preference when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: disabled }));
}
