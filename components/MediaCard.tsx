"use client";

import {
  Check,
  Clock3,
  Edit3,
  ExternalLink,
  FastForward,
  Link as LinkIcon,
  Play,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { MediaItem } from "@/types/media";
import {
  daysSince,
  progressLabel,
  relativeTime,
} from "@/utils/format";
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
  onCatchUp,
  onDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  m: MediaItem;
  mode?: "grid" | "list";
  priority?: boolean;
  onEdit?: (media: MediaItem) => void;
  onIncrement?: (id: string) => void | Promise<void>;
  onCatchUp?: (id: string, targetProgress: number) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<"increment" | "catchup" | "delete" | null>(null);
  const [optimisticProgress, setOptimisticProgress] = useState<number | null>(null);
  const [isTicked, setIsTicked] = useState(false);

  useEffect(() => {
    if (optimisticProgress !== null && m.progress_current >= optimisticProgress) {
      setOptimisticProgress(null);
    }
  }, [m.progress_current, optimisticProgress]);

  const currentProgress = optimisticProgress ?? m.progress_current;
  const normalizedStatus = m.status === "Watching/Reading" ? "Active" : m.status;
  const isActive = normalizedStatus === "Active";
  const canIncrement = isActive && Boolean(onIncrement);
  const isStale = isActive && daysSince(m.last_updated) >= 14;
  const safeWatchUrl = m.watch_url
    ? normalizePublicHttpUrl(m.watch_url)
    : m.tracker_url
      ? normalizePublicHttpUrl(m.tracker_url)
      : null;
  const latestRemote = m.latest_remote_progress ?? currentProgress;
  const unread = Math.max(0, latestRemote - currentProgress);
  const hasMultipleUnread = unread > 1;

  const pct =
    m.progress_total > 0
      ? Math.max(0, Math.min(100, (currentProgress / m.progress_total) * 100))
      : latestRemote > 0
        ? Math.max(0, Math.min(100, (currentProgress / latestRemote) * 100))
        : 0;
  const total = m.progress_total > 0 ? formatProgress(m.progress_total) : "—";
  const isScreenMedia = m.media_type === "Anime" || m.media_type === "Donghua";
  const unit = isScreenMedia ? "episodes" : "chapters";
  const shortUnit = isScreenMedia ? "Ep" : "Ch";

  const triggerTick = () => {
    setIsTicked(true);
    window.setTimeout(() => setIsTicked(false), 320);
  };

  const increment = async () => {
    if (!onIncrement || pendingAction) return;
    const nextVal = m.progress_total > 0
      ? Math.min(m.progress_total, currentProgress + 1)
      : currentProgress + 1;
    setOptimisticProgress(nextVal);
    triggerTick();
    setPendingAction("increment");
    try {
      await onIncrement(m._id);
    } catch {
      setOptimisticProgress(null);
    } finally {
      setPendingAction(null);
    }
  };

  const catchUp = async () => {
    if ((!onCatchUp && !onIncrement) || pendingAction) return;
    setOptimisticProgress(latestRemote);
    triggerTick();
    setPendingAction("catchup");
    try {
      if (onCatchUp) {
        await onCatchUp(m._id, latestRemote);
      } else if (onIncrement) {
        await onIncrement(m._id);
      }
    } catch {
      setOptimisticProgress(null);
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
      <article
        className={`media-list-row ${selected ? "is-selected" : ""}`}
        data-id={m._id}
        data-status={normalizedStatus}
        onClick={(event) => {
          if (selectable && onToggleSelect) {
            if (event.target instanceof Element && event.target.closest("a, button:not(.media-list-select-btn)")) return;
            onToggleSelect(m._id);
          }
        }}
      >
        {selectable && (
          <button
            type="button"
            className={`media-list-select-btn ${selected ? "is-selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(m._id);
            }}
            aria-label={selected ? `Deselect ${m.title}` : `Select ${m.title}`}
            aria-pressed={selected}
          >
            {selected ? <Check size={13} strokeWidth={3} /> : null}
          </button>
        )}
        <MediaArtwork media={m} className="media-list-art" priority={priority} />
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
          <strong className={`progress-current-val ${isTicked ? "is-ticked" : ""}`}>
            {formatProgress(currentProgress)}
          </strong>
          <span>/ {total} {unit}</span>
          <div className="progress-track">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        {unread > 0 && <span className="release-badge">+{formatProgress(unread)} new</span>}
        <div className="media-list-actions">
          {hasMultipleUnread && onCatchUp ? (
            <button
              onClick={catchUp}
              disabled={Boolean(pendingAction)}
              aria-label={`Catch up to ${latestRemote} for ${m.title}`}
              title={`Catch up to ${shortUnit} ${formatProgress(latestRemote)}`}
              className="action-catchup"
            >
              {pendingAction === "catchup" ? (
                <span className="spinner" />
              ) : (
                <FastForward size={15} />
              )}
            </button>
          ) : canIncrement ? (
            <button
              onClick={increment}
              disabled={Boolean(pendingAction)}
              aria-label={`Log next for ${m.title}`}
              title={`Log ${shortUnit} ${formatProgress(currentProgress + 1)}`}
              className="media-list-inc-btn"
            >
              {pendingAction === "increment" ? (
                <span className="spinner" />
              ) : (
                <Plus size={16} />
              )}
            </button>
          ) : null}
          {onEdit && (
            <button onClick={() => onEdit(m)} aria-label={`Edit ${m.title}`} title="Edit entry">
              <Edit3 size={16} />
            </button>
          )}
          {safeWatchUrl ? (
            <a
              href={safeWatchUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open tracker for ${m.title}`}
                title={isScreenMedia ? "Open watch link" : "Open tracker"}
            >
              <ExternalLink size={16} />
            </a>
          ) : (
            <button type="button" disabled aria-label={`No tracker link for ${m.title}`} title="No tracker link">
              <ExternalLink size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={remove}
              disabled={Boolean(pendingAction)}
              aria-label={`Delete ${m.title}`}
              title="Delete entry"
            >
              {pendingAction === "delete" ? <span className="spinner" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`media-card ${priority ? "is-priority" : ""} ${selected ? "is-selected" : ""}`}
      data-id={m._id}
      data-status={normalizedStatus}
      tabIndex={-1}
      onClick={(event) => {
        if (selectable && onToggleSelect) {
          if (event.target instanceof Element && event.target.closest("a, button:not(.media-card-select-btn)")) return;
          onToggleSelect(m._id);
          return;
        }
        if (!window.matchMedia("(max-width: 640px)").matches) return;
        if (event.target instanceof Element && event.target.closest("a, button")) return;
        event.currentTarget.focus({ preventScroll: true });
      }}
    >
      <div className="media-card-poster">
        {selectable && (
          <button
            type="button"
            className={`media-card-select-btn ${selected ? "is-selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(m._id);
            }}
            aria-label={selected ? `Deselect ${m.title}` : `Select ${m.title}`}
            aria-pressed={selected}
          >
            {selected ? <Check size={14} strokeWidth={3} /> : null}
          </button>
        )}
        <MediaArtwork media={m} priority={priority} />
        <div className="media-card-hover-actions">
          {onEdit && (
            <button onClick={() => onEdit(m)} aria-label={`Edit ${m.title}`} title="Edit entry">
              <Edit3 size={17} />
            </button>
          )}
          {onDelete && (
            <button
              className="media-card-delete"
              onClick={remove}
              disabled={Boolean(pendingAction)}
              aria-label={`Delete ${m.title}`}
              title="Delete entry"
            >
              {pendingAction === "delete" ? <span className="spinner" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
        <div className="poster-badges">
          {unread > 0 && (
            <span className="new-badge">
              +{formatProgress(unread)} new
            </span>
          )}
          {isStale && (
            <span className="stale-badge">
              <Clock3 size={11} /> Stale
            </span>
          )}
        </div>
        {(safeWatchUrl || canIncrement) && (
          <div className="media-card-poster-actions">
            {safeWatchUrl && (
              <a
                className="poster-tracker"
                href={safeWatchUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open tracker for ${m.title}`}
              title={isScreenMedia ? "Open watch link" : "Open tracker"}
              >
                <ExternalLink size={15} />
              </a>
            )}
            {canIncrement && (
              <button
                className={`poster-play ${isTicked ? "is-ticked" : ""}`}
                onClick={increment}
                disabled={Boolean(pendingAction)}
                aria-label={`Log next for ${m.title}`}
                title={`Log ${shortUnit} ${formatProgress(currentProgress + 1)}`}
              >
                {pendingAction === "increment" ? (
                  <span className="spinner" />
                ) : isScreenMedia ? (
                  <Play size={15} fill="currentColor" />
                ) : (
                  <Plus size={16} strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="media-card-content">
        <div className="media-card-title-row">
          <h3 title={m.title}>{m.title}</h3>
          {m.rating ? (
            <span className="rating-pill">
              <Star size={11} fill="currentColor" /> {m.rating}
            </span>
          ) : null}
        </div>
        <p>
          {m.media_type} · <span className="media-card-status">{normalizedStatus}</span>
        </p>

        <div className="media-card-progress-row">
          <span>
            <strong className={`progress-current-val ${isTicked ? "is-ticked" : ""}`}>
              {formatProgress(currentProgress)}
            </strong>{" "}
            / {total}
          </span>
          <span className="progress-unit-label">{unit}</span>
        </div>
        <div className="progress-track" aria-label={`${Math.round(pct)}% complete`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </article>
  );
}
