"use client";

import { useMediaStore } from "@/store/mediaStore";
import { useEffect, useState, useCallback } from "react";

type AnalyticsData = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
};

const STATUS_COLORS: Record<string, string> = {
  "Active": "var(--cyan)", "Completed": "var(--green)",
  "Planned": "var(--amber)", "On Hold": "var(--blue)",
  "Dropped": "var(--red)",
};

const TYPE_COLORS: Record<string, string> = {
  "Anime": "var(--cyan)", "Manhwa": "var(--green)",
  "Donghua": "var(--amber)", "Light Novel": "var(--blue)",
};

export default function AnalyticsPage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = ["Watching/Reading", "Completed", "Planned", "On Hold", "Dropped"];
      const types = ["Anime", "Manhwa", "Donghua", "Light Novel"];

      const [totalRes, ...rest] = await Promise.all([
        fetch("/api/media?limit=1", { cache: "no-store" }),
        ...statuses.map((s) => fetch(`/api/media?status=${encodeURIComponent(s)}&limit=1`, { cache: "no-store" })),
        ...types.map((t) => fetch(`/api/media?media_type=${encodeURIComponent(t)}&limit=1`, { cache: "no-store" })),
      ]);

      const totalJson = totalRes.ok ? await totalRes.json() : { data: { total: 0 } };
      const byStatus: Record<string, number> = {};
      const byType: Record<string, number> = {};

      for (let i = 0; i < statuses.length; i++) {
        const json = rest[i].ok ? await rest[i].json() : { data: { total: 0 } };
        // Normalize "Watching/Reading" back to "Active" for display
        const displayStatus = statuses[i] === "Watching/Reading" ? "Active" : statuses[i];
        byStatus[displayStatus] = json.data.total || 0;
      }
      for (let i = 0; i < types.length; i++) {
        const json = rest[statuses.length + i].ok ? await rest[statuses.length + i].json() : { data: { total: 0 } };
        byType[types[i]] = json.data.total || 0;
      }

      setData({ total: totalJson.data.total || 0, byStatus, byType });
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setActiveRoute("analytics");
    fetchAnalytics();
  }, [fetchAnalytics, setActiveRoute]);

  if (loading || !data) return <div className="page-content"><div className="loading-state"><span className="spinner" /> Loading analytics...</div></div>;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card" style={{ borderColor: "var(--accent)" }}>
          <span className="stat-label">Total Entries</span>
          <span className="stat-value">{data.total}</span>
        </div>
      </div>

      <div className="form-grid">
        <div className="stat-card">
          <div className="stat-label" style={{ marginBottom: "16px" }}>By Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {Object.entries(data.byStatus).map(([status, count]) => (
              <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                <span>{status}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 24, height: 8, borderRadius: "4px", overflow: "hidden" }}>
            {Object.entries(data.byStatus).map(([status, count]) => (
              count > 0 ? <div key={status} style={{
                flex: count, background: STATUS_COLORS[status] || "var(--text-secondary)", minWidth: 4,
              }} title={`${status}: ${count}`} /> : null
            ))}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label" style={{ marginBottom: "16px" }}>By Type</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {Object.entries(data.byType).map(([type, count]) => (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                <span>{type}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 24, height: 8, borderRadius: "4px", overflow: "hidden" }}>
            {Object.entries(data.byType).map(([type, count]) => (
              count > 0 ? <div key={type} style={{
                flex: count, background: TYPE_COLORS[type] || "var(--text-secondary)", minWidth: 4,
              }} title={`${type}: ${count}`} /> : null
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
