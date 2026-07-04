"use client";

import React from "react";
import { useMediaStore } from "@/store/mediaStore";
import { useEffect, useState, useCallback } from "react";
import { MediaItem } from "@/types/media";
import { PageLoader } from "@/components/PageLoader";
import {
  TrendingUp, Award, Star, Clock, BarChart2, PieChart,
  Activity, Tv, BookOpen, Film, BookMarked,
} from "lucide-react";

type AnalyticsData = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgRating: number;
  ratedCount: number;
  totalProgress: number;
  completionRate: number;
  recentItems: MediaItem[];
  topRated: MediaItem[];
};

const STATUS_COLORS: Record<string, string> = {
  "Active": "var(--cyan)",
  "Completed": "var(--green)",
  "Planned": "var(--amber)",
  "On Hold": "var(--blue, #60a5fa)",
  "Dropped": "var(--red)",
};

const TYPE_COLORS: Record<string, string> = {
  "Anime": "var(--cyan)",
  "Manhwa": "var(--green)",
  "Donghua": "var(--amber)",
  "Light Novel": "var(--violet)",
};

const TYPE_ICON_MAP: Record<string, React.ElementType> = {
  "Anime": Tv,
  "Manhwa": BookOpen,
  "Donghua": Film,
  "Light Novel": BookMarked,
};

export default function AnalyticsPage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setActiveRoute("analytics");
    fetchAnalytics();
  }, [fetchAnalytics, setActiveRoute]);

  if (loading || !data) {
    return <PageLoader label="Reading the numbers" detail="Building your analytics view" compact />;
  }

  const maxStatusCount = Math.max(...Object.values(data.byStatus), 1);
  const maxTypeCount = Math.max(...Object.values(data.byType), 1);

  return (
    <div className="analytics-page">
      <div className="analytics-page-header">
        <div>
          <span className="analytics-eyebrow">Collection pulse</span>
          <h2>Analytics</h2>
        </div>
        <span className="analytics-page-summary">
          {data.total} entries · {data.ratedCount} rated · {data.completionRate.toFixed(0)}% complete
        </span>
      </div>

      <div className="analytics-hero">
        <div className="analytics-hero-card" style={{ borderColor: "var(--accent)" }}>
          <div className="analytics-hero-top">
            <div className="analytics-hero-icon" style={{ color: "var(--accent)" }}>
              <BarChart2 size={20} />
            </div>
            <span className="analytics-hero-kicker">Library</span>
          </div>
          <span className="analytics-hero-value">{data.total}</span>
          <span className="analytics-hero-label">Total Entries</span>
        </div>
        <div className="analytics-hero-card">
          <div className="analytics-hero-top">
            <div className="analytics-hero-icon" style={{ color: "var(--green)" }}>
              <TrendingUp size={20} />
            </div>
            <span className="analytics-hero-kicker">Finished</span>
          </div>
          <span className="analytics-hero-value">{data.completionRate.toFixed(0)}%</span>
          <span className="analytics-hero-label">Completion Rate</span>
        </div>
        <div className="analytics-hero-card">
          <div className="analytics-hero-top">
            <div className="analytics-hero-icon" style={{ color: "var(--amber)" }}>
              <Star size={20} />
            </div>
            <span className="analytics-hero-kicker">Taste</span>
          </div>
          <span className="analytics-hero-value">{data.ratedCount > 0 ? data.avgRating.toFixed(1) : "—"}</span>
          <span className="analytics-hero-label">Avg Rating ({data.ratedCount} rated)</span>
        </div>
        <div className="analytics-hero-card">
          <div className="analytics-hero-top">
            <div className="analytics-hero-icon" style={{ color: "var(--cyan)" }}>
              <Activity size={20} />
            </div>
            <span className="analytics-hero-kicker">Progress</span>
          </div>
          <span className="analytics-hero-value">{data.totalProgress.toLocaleString()}</span>
          <span className="analytics-hero-label">Total Episodes / Chapters</span>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-title">
              <PieChart size={16} />
              <h3>Status Distribution</h3>
            </div>
            <span>{data.total} total</span>
          </div>
          <div className="analytics-bars">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <div key={status} className="analytics-bar-row">
                <div className="analytics-bar-label">
                  <span className="analytics-bar-dot" style={{ background: STATUS_COLORS[status] || "var(--text-secondary)" }} />
                  <span>{status}</span>
                </div>
                <div className="analytics-bar-track">
                  <div
                    className="analytics-bar-fill"
                    style={{
                      width: `${(count / maxStatusCount) * 100}%`,
                      background: STATUS_COLORS[status] || "var(--text-secondary)",
                    }}
                  />
                </div>
                <span className="analytics-bar-count">{count}</span>
              </div>
            ))}
          </div>
          <div className="analytics-stacked-bar">
            {Object.entries(data.byStatus).map(([status, count]) =>
              count > 0 ? (
                <div
                  key={status}
                  style={{ flex: count, background: STATUS_COLORS[status] || "var(--text-secondary)", minWidth: 4 }}
                  title={`${status}: ${count}`}
                />
              ) : null
            )}
          </div>
        </div>

        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-title">
              <BarChart2 size={16} />
              <h3>Media Types</h3>
            </div>
            <span>{Object.keys(data.byType).length} formats</span>
          </div>
          <div className="analytics-bars">
            {Object.entries(data.byType).map(([type, count]) => {
              const TypeIcon = TYPE_ICON_MAP[type] || BookMarked;
              return (
                <div key={type} className="analytics-bar-row">
                  <div className="analytics-bar-label">
                    <TypeIcon size={14} style={{ color: TYPE_COLORS[type] || "var(--text-secondary)", flexShrink: 0 }} />
                    <span>{type}</span>
                  </div>
                  <div className="analytics-bar-track">
                    <div
                      className="analytics-bar-fill"
                      style={{
                        width: `${(count / maxTypeCount) * 100}%`,
                        background: TYPE_COLORS[type] || "var(--text-secondary)",
                      }}
                    />
                  </div>
                  <span className="analytics-bar-count">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="analytics-stacked-bar">
            {Object.entries(data.byType).map(([type, count]) =>
              count > 0 ? (
                <div
                  key={type}
                  style={{ flex: count, background: TYPE_COLORS[type] || "var(--text-secondary)", minWidth: 4 }}
                  title={`${type}: ${count}`}
                />
              ) : null
            )}
          </div>
        </div>

        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-title">
              <Award size={16} />
              <h3>Top Rated</h3>
            </div>
          </div>
          {data.topRated.length === 0 ? (
            <p className="analytics-muted">No rated entries yet. Add ratings to your entries to see them here.</p>
          ) : (
            <div className="analytics-list">
              {data.topRated.map((m, i) => (
                <div key={m._id} className="analytics-list-item">
                  <span className="analytics-rank">#{i + 1}</span>
                  <div className="analytics-list-info">
                    <span className="analytics-list-title">{m.title}</span>
                    <span className="analytics-list-meta">{m.media_type}</span>
                  </div>
                  <div className="analytics-list-rating">
                    <Star size={12} fill="currentColor" strokeWidth={0} />
                    <span>{m.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analytics-panel">
          <div className="analytics-panel-header">
            <div className="analytics-panel-title">
              <Clock size={16} />
              <h3>Recently Updated</h3>
            </div>
          </div>
          {data.recentItems.length === 0 ? (
            <p className="analytics-muted">No recent activity.</p>
          ) : (
            <div className="analytics-list">
              {data.recentItems.map((m) => {
                const mappedStatus = m.status === "Watching/Reading" ? "Active" : m.status;
                return (
                  <div key={m._id} className="analytics-list-item">
                    <span
                      className="analytics-list-dot"
                      style={{ background: STATUS_COLORS[mappedStatus] || "var(--text-secondary)" }}
                    />
                    <div className="analytics-list-info">
                      <span className="analytics-list-title">{m.title}</span>
                      <span className="analytics-list-meta">
                        {m.progress_current} / {m.progress_total || "?"} · {mappedStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
