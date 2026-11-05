"use client";
import Link from "next/link";

import { useState } from "react";
import { Check, Edit3, ExternalLink, FastForward, Plus, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { MediaArtwork } from "./MediaArtwork";
import { useFeedback } from "./FeedbackProvider";
import type { MediaItem } from "@/types/media";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import { useMediaStore } from "@/store/mediaStore";
import { formatProgress, progressSummary } from "@/utils/progress";
import { relativeTime } from "@/utils/format";

export function MediaDetails({ media, onClose }: { media: MediaItem; onClose: () => void }) {
  const [item, setItem] = useState(media);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const refresh = useMediaStore((state) => state.refreshMedia);
  const edit = useMediaStore((state) => state.openModal);
  const { confirm } = useFeedback();
  const p = progressSummary(item);
  const source = normalizePublicHttpUrl(item.watch_url || item.tracker_url || "");

  const saveProgress = async (target: number) => {
    if (pending) return;
    setPending(true); setError(""); setSaved(false);
    try {
      await apiRequest(`/api/media?id=${item._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: target }),
      });
      setItem((old) => ({ ...old, progress_current: target }));
      setSaved(true); refresh();
    } catch (err) { setError(getErrorMessage(err, "Could not save progress. Try again.")); }
    finally { setPending(false); }
  };

  return (
    <Dialog labelledBy="story-details-title" onClose={onClose} busy={pending} className="story-details-dialog">
      <section className="modal story-details">
        <button className="modal-close" data-dialog-close aria-label="Close story details"><X size={20} /></button>
        <div className="story-details-art"><MediaArtwork media={item} priority /></div>
        <div className="story-details-copy">
          <span className="section-eyebrow">Collection record / {item.media_type}</span>
          <h2 id="story-details-title">{item.title}</h2>
          <p className="story-details-meta">{item.media_type} · {item.status}{item.rating ? ` · ★ ${item.rating}` : ""}</p>
          <div className="story-details-progress" aria-live="polite">
            <strong>{p.label}</strong>
            {p.knownTotal && <div className="progress-track"><i style={{ width: `${p.percent}%` }} /></div>}
            <p>{p.availability}</p>
            {saved && <span className="saved-note" role="status"><Check size={15} /> Progress saved</span>}
          </div>
          {["Active", "Watching/Reading"].includes(item.status) && <div className="story-details-actions">
            <button className="btn-primary" disabled={pending || p.next <= item.progress_current} onClick={() => saveProgress(p.next)}>
              {pending ? <span className="spinner" /> : <Plus size={17} />} Log {p.shortUnit} {formatProgress(p.next)}
            </button>
            {p.unread > 1 && <button className="btn-secondary" disabled={pending} onClick={async () => {
              if (await confirm({ title: "Mark this story caught up?", message: `Update your progress from ${formatProgress(item.progress_current)} to ${formatProgress(item.latest_remote_progress!)} ${p.unit}?`, confirmLabel: "Mark caught up" })) {
                await saveProgress(item.latest_remote_progress!);
              }
            }}><FastForward size={16} /> Catch up</button>}
          </div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {item.notes && <div className="story-details-notes"><span className="section-eyebrow">Your notes</span><p>{item.notes}</p></div>}
          <div className="story-details-links">
            <button className="btn-ghost" onClick={() => { onClose(); edit(item); }}><Edit3 size={16} /> Edit entry</button>
            {item.hosted_novel_slug && <Link className="btn-primary" onClick={onClose} href={`/read/${item.hosted_novel_slug}/${Math.max(1, Math.min(item.progress_total || 1, Math.floor(item.progress_current || 1)))}`}>Continue reading →</Link>}
            {source && <a className="btn-ghost" href={source} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open source</a>}
          </div>
          <details className="story-source-info"><summary>Tracking details</summary>
            <p>Updated {relativeTime(item.last_updated)}. {item.last_checked_at ? `Tracker checked ${relativeTime(item.last_checked_at)}.` : "No tracker check recorded."}</p>
            {item.last_scrape_error && <p>{item.last_scrape_error}</p>}
            <p>Tracker releases never change your logged progress automatically.</p>
          </details>
        </div>
      </section>
    </Dialog>
  );
}
