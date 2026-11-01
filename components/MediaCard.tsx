"use client";

import { Check, Edit3, ExternalLink, FastForward, MoreHorizontal, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/types/media";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import { MediaArtwork } from "@/components/MediaArtwork";
import { useMediaStore } from "@/store/mediaStore";
import { formatProgress, progressSummary } from "@/utils/progress";

export function MediaCard({ m, mode = "grid", priority = false, position, onEdit, onIncrement, onCatchUp, onDelete,
  selectable = false, selected = false, onToggleSelect }: {
  m: MediaItem; mode?: "grid" | "list"; priority?: boolean; position?: number;
  onEdit?: (media: MediaItem) => void;
  onIncrement?: (id: string) => void | Promise<void>;
  onCatchUp?: (id: string, target: number) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  selectable?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void;
}) {
  const openDetails = useMediaStore((state) => state.openDetails);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const current = optimistic ?? m.progress_current;
  const p = progressSummary(m, current);
  const status = m.status === "Watching/Reading" ? "Active" : m.status;
  const canIncrement = status === "Active" && !!onIncrement && p.next > current;
  const tracker = normalizePublicHttpUrl(m.watch_url || m.tracker_url || "");

  useEffect(() => {
    setOptimistic(null);
  }, [m.progress_current]);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const increment = async () => {
    if (!onIncrement || pending) return;
    setPending(true); setFailed(false); setOptimistic(p.next);
    try {
      await onIncrement(m._id);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1600);
    } catch {
      setOptimistic(null); setSaved(false); setFailed(true);
    } finally { setPending(false); }
  };

  const select = () => onToggleSelect?.(m._id);
  const selection = selectable && (
    <button type="button" className={`${mode === "list" ? "media-list-select-btn" : "media-card-select-btn"} ${selected ? "is-selected" : ""}`}
      onClick={select} aria-label={`${selected ? "Deselect" : "Select"} ${m.title}`} aria-pressed={selected}>
      {selected && <Check size={17} />}
    </button>
  );
  const actions = (
    <div className="story-actions">
      {tracker ? <a href={tracker} target="_blank" rel="noreferrer" aria-label={`Open tracker for ${m.title}`} title="Open source"><ExternalLink size={16} /></a>
        : mode === "list" && <button disabled aria-label={`No tracker link for ${m.title}`} title="No tracker link"><ExternalLink size={16} /></button>}
      {onIncrement && status === "Active" && (
        <button className={`story-log ${saved ? "is-saved" : ""}`} onClick={increment} disabled={pending || !canIncrement}
          aria-label={`Log next for ${m.title}`} title={`Log ${p.shortUnit} ${formatProgress(p.next)}`}>
          {pending ? <span className="spinner" /> : saved ? <Check size={16} /> : <Plus size={17} />}
          <span>{saved ? "Saved" : "+1"}</span>
        </button>
      )}
      {(onEdit || onDelete || onCatchUp) && (
        <details className="story-menu" ref={menu} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }} onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current?.open) {
            event.stopPropagation(); menu.current.open = false; menu.current.querySelector("summary")?.focus();
          }
        }}>
          <summary aria-label={`More actions for ${m.title}`}><MoreHorizontal size={18} /></summary>
          <div className="story-menu-content">
            {onEdit && <button onClick={() => { if (menu.current) { menu.current.querySelector("summary")?.focus(); menu.current.open = false; } onEdit(m); }}><Edit3 size={15} /> Edit entry</button>}
            {onCatchUp && p.unread > 0 && <button disabled={pending} onClick={async () => {
              if (menu.current) { menu.current.querySelector("summary")?.focus(); menu.current.open = false; }
              setPending(true);
              try { await onCatchUp(m._id, m.latest_remote_progress!); } catch { setFailed(true); }
              finally { setPending(false); }
            }}><FastForward size={15} /> Catch up to {formatProgress(m.latest_remote_progress!)}</button>}
            {onDelete && <button className="is-danger" disabled={pending} onClick={async () => {
              if (menu.current) { menu.current.querySelector("summary")?.focus(); menu.current.open = false; }
              setPending(true);
              try { await onDelete(m._id); } finally { setPending(false); }
            }}><Trash2 size={15} /> Delete entry</button>}
          </div>
        </details>
      )}
    </div>
  );

  return (
    <article className={`${mode === "list" ? "media-list-row" : "media-card"} ${selected ? "is-selected" : ""} ${saved ? "is-saved" : ""}`}
      data-id={m._id} data-status={status} data-priority={priority || undefined}>
      {mode === "grid" && <div className="catalogue-card-index"><span>{m.media_type}</span>{position !== undefined && <span aria-label={`Position ${position}`}>{String(position).padStart(2, "0")}</span>}</div>}
      <div className={mode === "list" ? "story-list-cover" : "media-card-poster"}>
        <button className="story-cover-button" onClick={selectable ? select : () => openDetails(m)}
          aria-label={selectable ? `${selected ? "Deselect" : "Select"} cover for ${m.title}` : `View details for ${m.title}`}>
          <MediaArtwork media={m} priority={priority} />
        </button>
        {selection}
        {p.unread > 0 && <span className="story-bookmark">+{formatProgress(p.unread)}<span className="sr-only"> {p.unit} unread</span></span>}
      </div>
      <div className="media-card-content">
        <div className="media-card-title-row">
          <h3><button onClick={() => openDetails(m)}>{m.title}</button></h3>
          {!!m.rating && <span className="rating-pill"><Star size={12} fill="currentColor" />{m.rating}</span>}
        </div>
        <p>{mode === "list" && <>{m.media_type}<span className="story-meta-dot">·</span></>}<span className="media-card-status">{status}</span></p>
        <div className="story-progress" aria-live="polite">
          <strong className={`progress-current-val ${saved ? "is-ticked" : ""}`}>{p.label}</strong>
          <span className="story-availability">{p.knownTotal ? `${Math.round(p.percent!)}% complete` : p.availability}</span>
          {p.knownTotal && <div className="progress-track" aria-label={`${Math.round(p.percent!)}% complete`}><i style={{ width: `${p.percent}%` }} /></div>}
          {p.knownTotal && p.unread > 0 && <span className="story-availability">{p.availability}</span>}
        </div>
        {failed && <p className="story-save-error" role="status">Not saved. Try +1 again.</p>}
      </div>
      {!selectable && actions}
    </article>
  );
}
