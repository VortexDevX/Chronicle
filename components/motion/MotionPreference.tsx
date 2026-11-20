"use client";

import { useSyncExternalStore } from "react";
import { motionDisabled, setMotionDisabled, subscribeMotion } from "@/lib/client/motionPreference";

export function MotionPreference() {
  const disabled = useSyncExternalStore(subscribeMotion, motionDisabled, () => false);
  return (
    <label className="settings-toggle motion-preference" data-checked={!disabled}>
      <input type="checkbox" checked={!disabled} onChange={(event) => setMotionDisabled(!event.target.checked)} />
      <span className="settings-toggle-track" aria-hidden="true"><span className="settings-toggle-thumb" /></span>
      <span className="settings-toggle-text">
        <span className="settings-toggle-header"><span className="settings-toggle-copy">Interface motion</span><span className="settings-toggle-state" data-state={disabled ? "off" : "on"}>{disabled ? "Off" : "On"}</span></span>
        <span className="settings-toggle-description">Gentle entrances and small accents after a successful save. Saved on this device. Your system’s reduced-motion setting always takes priority.</span>
      </span>
    </label>
  );
}
