"use client";

import { GlobalStats } from "@/store/mediaStore";

export function StatsRow({ stats }: { stats: GlobalStats | null }) {
  if (!stats) return null;

  return (
    <div className="stats-row-compact">
      <div className="stat-chip" style={{ borderColor: "var(--accent)" }}>
        <span className="stat-chip-value">{stats.total}</span>
        <span className="stat-chip-label">Total</span>
      </div>
      <div className="stat-chip">
        <span className="stat-chip-value" style={{ color: "var(--cyan)" }}>{stats.watching}</span>
        <span className="stat-chip-label">Active</span>
      </div>
      <div className="stat-chip">
        <span className="stat-chip-value" style={{ color: "var(--green)" }}>{stats.completed}</span>
        <span className="stat-chip-label">Completed</span>
      </div>
      <div className="stat-chip">
        <span className="stat-chip-value" style={{ color: "var(--red)" }}>{stats.dropped}</span>
        <span className="stat-chip-label">Dropped</span>
      </div>
    </div>
  );
}
