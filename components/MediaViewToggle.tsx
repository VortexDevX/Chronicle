"use client";

import { Grid2X2, List } from "lucide-react";

export type MediaViewMode = "grid" | "list";

export function MediaViewToggle({
  value,
  onChange,
  label = "Media view",
}: {
  value: MediaViewMode;
  onChange: (mode: MediaViewMode) => void;
  label?: string;
}) {
  return (
    <div className="view-toggle" aria-label={label}>
      <button
        type="button"
        className={value === "grid" ? "is-active" : ""}
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        aria-pressed={value === "grid"}
      >
        <Grid2X2 size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={value === "list" ? "is-active" : ""}
        onClick={() => onChange("list")}
        aria-label="List view"
        aria-pressed={value === "list"}
      >
        <List size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
