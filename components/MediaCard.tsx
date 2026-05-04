"use client";

import { MediaItem } from "@/types/media";
import { Edit2, Plus, Trash2, Star, ExternalLink, Link as LinkIcon, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { getCachedCover, queueCoverFetch } from "@/store/coverCache";
import { relativeTime, daysSince, progressLabel } from "@/utils/format";

export function MediaCard({ m, onEdit, onIncrement, onDelete }: {
  m: MediaItem;
  onEdit?: (m: MediaItem) => void;
  onIncrement?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [coverUrl, setCoverUrl] = useState("");

  useEffect(() => {
    setCoverUrl("");

    if (m.custom_cover_url) {
      setCoverUrl(m.custom_cover_url);
      return;
    }

    const isAnime = m.media_type === "Anime" || m.media_type === "Donghua";
    const isManhwa = m.media_type === "Manhwa" && m.mangadex_id;
    
    if (isAnime || isManhwa) {
      const cacheKey = isManhwa && m.mangadex_id ? `md-${m.mangadex_id}` : m.title;
      const cached = getCachedCover(cacheKey);
      
      if (cached !== undefined) {
        setCoverUrl(cached || "");
        return;
      }

      queueCoverFetch(m.title, m._id, m.mangadex_id || undefined);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        const c = getCachedCover(cacheKey);
        if (c !== undefined || attempts >= 12) {
          setCoverUrl(c || "");
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [m._id, m.title, m.media_type, m.mangadex_id, m.custom_cover_url]);

  const pct = m.progress_total
    ? Math.min(100, Math.round((m.progress_current / m.progress_total) * 100))
    : 0;
  const unit = progressLabel(m.media_type).toUpperCase();
  const totalStr = m.progress_total ? m.progress_total : "?";
  
  const isStale = m.status === "Watching/Reading" && daysSince(m.last_updated) >= 14;
  const staleClass = isStale ? " card-stale" : "";
  const thumbClass = coverUrl ? "card-thumb thumb-loaded" : "card-thumb";
  const thumbStyle = coverUrl ? { backgroundImage: `url('${coverUrl}')` } : {};

  // For the active status
  const mappedStatus = m.status === "Watching/Reading" ? "Active" : m.status;

  const progressColorMap: Record<string, string> = {
    "Active": "var(--cyan)",
    "Completed": "var(--green)",
    "Planned": "var(--violet)",
    "On Hold": "var(--amber)",
    "Dropped": "var(--red)",
  };
  const progressColor = progressColorMap[mappedStatus] ?? "var(--text-secondary)";

  return (
    <div className={`card${staleClass}`} data-status={mappedStatus} data-id={m._id}>
      <div className="card-poster">
        <div className={thumbClass} style={thumbStyle} data-cover-id={m._id}></div>
        <div className="card-poster-overlay">
          <div className="card-badges">
            <span className="badge">{m.media_type}</span>
            <span className="badge" data-status={mappedStatus}>{mappedStatus}</span>
            {isStale && (
              <span className="badge badge-stale" title={`Not updated in ${daysSince(m.last_updated)} days`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> Stale
              </span>
            )}
          </div>
          <h3 className="card-title" title={m.title}>{m.title}</h3>
          
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "6px", alignItems: "center" }}>
            {relativeTime(m.last_updated)}
            {m.linked_entries_data && m.linked_entries_data.length > 0 && (
              <span title={m.linked_entries_data.map(l => l.title).join(", ")} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                <LinkIcon size={10} /> {m.linked_entries_data.length}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="card-body">
        <div className="card-progress-header">
          <span className="card-progress-text">
            <strong>{m.progress_current}</strong>
            <span style={{ opacity: 0.5, margin: "0 4px" }}>/ {totalStr}</span>
            <span style={{ fontSize: "0.75rem", fontWeight: "bold" }}>{unit}</span>
          </span>
          {m.rating ? (
            <div className="card-rating">
              <Star size={14} fill="currentColor" strokeWidth={0} />
              <span>{m.rating}<span style={{ opacity: 0.5, fontSize: "0.8em" }}>/10</span></span>
            </div>
          ) : null}
        </div>
        <div className="card-progress-track">
          <div className="card-progress-fill" style={{ width: `${pct}%`, background: progressColor }}></div>
        </div>
      </div>

      <div className="card-actions">
        <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); onEdit?.(m); }} title="Edit">
          <Edit2 size={16} />
        </button>
        <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); onIncrement?.(m._id); }} title="Increment progress">
          <Plus size={16} strokeWidth={2.5} /> 1
        </button>
        <button className="btn-ghost" onClick={(e) => {
          e.stopPropagation();
          const url = m.tracker_url;
          if (url) window.open(url, "_blank");
        }} title="Continue (Open Tracker URL)" disabled={!m.tracker_url}>
          <ExternalLink size={16} />
        </button>
        <button className="btn-danger" onClick={(e) => { e.stopPropagation(); onDelete?.(m._id); }} title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
