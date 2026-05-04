"use client";

import { GlobalStats } from "@/store/mediaStore";

export function StatsRow({ stats }: { stats: GlobalStats | null }) {
  if (!stats) return null;

  return (
    <div className="stats-row">
      <div className="stat-card" style={{ borderColor: "var(--accent)" }}>
        <span className="stat-label">Total Entries</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label" style={{ color: "var(--cyan)" }}>Active</span>
        <span className="stat-value">{stats.watching}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label" style={{ color: "var(--green)" }}>Completed</span>
        <span className="stat-value">{stats.completed}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label" style={{ color: "var(--red)" }}>Dropped</span>
        <span className="stat-value">{stats.dropped}</span>
      </div>
    </div>
  );
}
