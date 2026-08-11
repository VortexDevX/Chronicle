"use client";

import {
  Clock3,
  Edit3,
  ExternalLink,
  Link as LinkIcon,
  Play,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { MediaItem } from "@/types/media";
import { daysSince, progressLabel, relativeTime } from "@/utils/format";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import { MediaArtwork } from "@/components/MediaArtwork";

function formatProgress(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function MediaCard({
  m,
  mode = "grid",
  priority = false,
  onEdit,
  onIncrement,
  onDelete,
}: {
  m: MediaItem;
  mode?: "grid" | "list";
  priority?: boolean;
  onEdit?: (media: MediaItem) => void;
  onIncrement?: (id: string) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"increment" | "delete" | null>(null);
  const normalizedStatus = m.status === "Watching/Reading" ? "Active" : m.status;
  const isActive = normalizedStatus === "Active";
  const canIncrement = isActive && Boolean(onIncrement);
  const isStale = isActive && daysSince(m.last_updated) >= 14;
  const safeTrackerUrl = m.tracker_url
    ? normalizePublicHttpUrl(m.tracker_url)
    : null;
  const pct =
    m.progress_total > 0
      ? Math.max(0, Math.min(100, (m.progress_current / m.progress_total) * 100))
      : 0;
  const total = m.progress_total > 0 ? formatProgress(m.progress_total) : "—";
  const unit = progressLabel(m.media_type) === "ep" ? "episodes" : "chapters";
  const unread = Math.max(
    0,
    Number(m.latest_remote_progress || m.progress_current) - m.progress_current,
  );

  const increment = async () => {
    if (!onIncrement || pendingAction) return;
    setPendingAction("increment");
    try {
      await onIncrement(m._id);
    } finally {
      setPendingAction(null);
    }
  };

  const remove = async () => {
    if (!onDelete || pendingAction) return;
    setPendingAction("delete");
    try {
      await onDelete(m._id);
    } finally {
      setPendingAction(null);
    }
  };

  if (mode === "list") {
    return (
      <article className="media-list-row" data-id={m._id} data-status={normalizedStatus}>
        <MediaArtwork media={m} className="media-list-art" />
        <div className="media-list-main">
          <div>
            <h3>{m.title}</h3>
            <span className="media-status" data-status={normalizedStatus}>
              {normalizedStatus}
            </span>
          </div>
          <p>
            {m.media_type} · Updated {relativeTime(m.last_updated)}
            {m.linked_entries_data?.length ? (
              <span title={m.linked_entries_data.map((item) => item.title).join(", ")}>
                <LinkIcon size={11} /> {m.linked_entries_data.length} linked
              </span>
            ) : null}
          </p>
        </div>
        <div className="media-list-progress">
          <strong>{formatProgress(m.progress_current)}</strong>
          <span>/ {total} {unit}</span>
          <div className="progress-track">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        {unread > 0 && <span className="release-badge">+{formatProgress(unread)} new</span>}
        <div className="media-list-actions">
          {canIncrement && (
            <button onClick={increment} disabled={Boolean(pendingAction)} aria-label={`Log next for ${m.title}`}>
              {pendingAction === "increment" ? <span className="spinner" /> : <Plus size={16} />}
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(m)} aria-label={`Edit ${m.title}`}>
              <Edit3 size={16} />
            </button>
          )}
          {safeTrackerUrl ? (
            <a href={safeTrackerUrl} target="_blank" rel="noreferrer" aria-label={`Open tracker for ${m.title}`}>
              <ExternalLink size={16} />
            </a>
          ) : (
            <button type="button" disabled aria-label={`No tracker link for ${m.title}`} title="No tracker link">
              <ExternalLink size={16} />
            </button>
          )}
          {onDelete && (
            <button onClick={remove} disabled={Boolean(pendingAction)} aria-label={`Delete ${m.title}`}>
              {pendingAction === "delete" ? <span className="spinner" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`media-card ${priority ? "is-priority" : ""}`}
      data-id={m._id}
      data-status={normalizedStatus}
      tabIndex={-1}
      onClick={(event) => {
        if (!window.matchMedia("(max-width: 640px)").matches) return;
        if (event.target instanceof Element && event.target.closest("a, button")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
    >
      <div className="media-card-poster">
        <MediaArtwork media={m} priority={priority} />
        <div className="media-card-hover-actions">
          {onEdit && (
            <button onClick={() => onEdit(m)} aria-label={`Edit ${m.title}`}>
              <Edit3 size={17} />
            </button>
          )}
          {onDelete && (
            <button className="media-card-delete" onClick={remove} disabled={Boolean(pendingAction)} aria-label={`Delete ${m.title}`}>
              {pendingAction === "delete" ? <span className="spinner" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
        <div className="poster-badges">
          {unread > 0 && <span className="new-badge">+{formatProgress(unread)} new</span>}
          {isStale && <span className="stale-badge"><Clock3 size={11} /> Stale</span>}
        </div>
        {(safeTrackerUrl || canIncrement) && (
          <div className="media-card-poster-actions">
            {safeTrackerUrl && (
              <a
                className="poster-tracker"
                href={safeTrackerUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open tracker for ${m.title}`}
              >
                <ExternalLink size={15} />
              </a>
            )}
            {canIncrement && (
              <button
                className="poster-play"
                onClick={increment}
                disabled={Boolean(pendingAction)}
                aria-label={`Log next for ${m.title}`}
              >
                {pendingAction === "increment" ? <span className="spinner" /> : <Play size={15} fill="currentColor" />}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="media-card-content">
        <div className="media-card-title-row">
          <h3 title={m.title}>{m.title}</h3>
          {m.rating ? (
            <span><Star size={11} fill="currentColor" /> {m.rating}</span>
          ) : null}
        </div>
        <p>{m.media_type} · <span className="media-card-status">{normalizedStatus}</span></p>
        <div className="media-card-progress-row">
          <span>{formatProgress(m.progress_current)} / {total}</span>
          <span>{unit}</span>
        </div>
        <div className="progress-track" aria-label={`${Math.round(pct)}% complete`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </article>
  );
}
