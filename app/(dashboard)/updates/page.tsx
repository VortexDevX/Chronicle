"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BellOff,
  BellRing,
  Check,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { MediaItem, UpdateFeedItem, UpdatesPayload } from "@/types/media";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { MediaArtwork } from "@/components/MediaArtwork";
import { relativeTime } from "@/utils/format";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import { PageLoader } from "@/components/PageLoader";

function formatProgress(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

const TELEGRAM_COPY = {
  fully_notified: { label: "Sent to Telegram", icon: Check },
  previously_notified: { label: "Newer release pending", icon: BellRing },
  not_notified: { label: "Not sent", icon: BellOff },
} as const;

export default function UpdatesPage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const { toast } = useFeedback();
  const [payload, setPayload] = useState<UpdatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadUpdates = useCallback(async () => {
    setError("");
    try {
      setPayload(await apiRequest<UpdatesPayload>("/api/updates", { cache: "no-store" }));
    } catch (err) {
      setError(getErrorMessage(err, "Could not load updates"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveRoute("updates");
    loadUpdates();
  }, [loadUpdates, setActiveRoute]);

  const logNext = async (item: MediaItem) => {
    if (pendingId) return;
    const next =
      item.progress_total > 0
        ? Math.min(item.progress_total, item.progress_current + 1)
        : item.progress_current + 1;
    if (next === item.progress_current) return;
    setPendingId(item._id);
    try {
      await apiRequest(`/api/media?id=${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: next }),
      });
      toast(`${item.title} progress updated`, "success");
      refreshMedia();
      await loadUpdates();
    } catch (err) {
      toast(getErrorMessage(err, "Progress update failed"), "error");
    } finally {
      setPendingId(null);
    }
  };

  if (loading && !payload) {
    return <PageLoader label="Checking your updates" detail="Reading stored tracker results" compact />;
  }

  if (error && !payload) {
    return (
      <section className="state-panel state-error">
        <RefreshCw size={24} />
        <h2>Updates unavailable.</h2>
        <p>{error}</p>
        <button className="btn-primary" onClick={() => { setLoading(true); loadUpdates(); }}>Try again</button>
      </section>
    );
  }

  const items = payload?.items || [];
  const errors = payload?.tracker_errors || [];

  return (
    <div className="updates-page">
      {payload?.partial_failures?.length ? (
        <div className="partial-notice">
          <AlertTriangle size={15} />
          Partial tracker data: {payload.partial_failures.join(", ")}.
          <button onClick={loadUpdates}>Retry</button>
        </div>
      ) : null}
      <section className="updates-summary">
        <div className="updates-orbit"><BellRing size={22} /><i /></div>
        <div>
          <span>Tracker status</span>
          <h2>{items.length ? `${items.length} ${items.length === 1 ? "title has" : "titles have"} unread releases` : "You are fully caught up"}</h2>
          <p>Manual progress stays authoritative. Telegram badges reflect successfully delivered notification state.</p>
        </div>
        <button onClick={() => { setLoading(true); loadUpdates(); }} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
        </button>
      </section>

      <div className="updates-layout">
        <section className="updates-feed">
          <div className="section-heading">
            <div><span>Unread releases</span><h2>Ready when you are</h2></div>
            <strong>{items.length}</strong>
          </div>
          {items.length ? items.map((item: UpdateFeedItem) => {
            const telegram = TELEGRAM_COPY[item.telegram_state];
            const TelegramIcon = telegram.icon;
            const trackerUrl = item.tracker_url ? normalizePublicHttpUrl(item.tracker_url) : null;
            return (
              <article className="update-row" key={item._id}>
                <MediaArtwork media={item} className="update-row-art" />
                <div className="update-row-main">
                  <div className="update-row-meta">
                    <span>{item.media_type}</span>
                    <span><Clock3 size={11} /> {item.last_checked_at ? relativeTime(item.last_checked_at) : "Not checked"}</span>
                    <span data-telegram={item.telegram_state}><TelegramIcon size={11} /> {telegram.label}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>You are at {formatProgress(item.progress_current)}. Latest stored release is {formatProgress(item.latest_remote_progress || item.progress_current)}.</p>
                  <div className="update-row-actions">
                    <button
                      className="btn-primary"
                      onClick={() => logNext(item)}
                      disabled={pendingId === item._id}
                    >
                      {pendingId === item._id ? <span className="spinner" /> : <Plus size={15} />}
                      Log one
                    </button>
                    <button className="btn-ghost" onClick={() => openModal(item)}>Edit entry</button>
                    {trackerUrl && (
                      <a className="btn-ghost" href={trackerUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> Open tracker
                      </a>
                    )}
                  </div>
                </div>
                <div className="update-delta">
                  <strong>+{formatProgress(item.unread_delta)}</strong>
                  <span>{item.media_type === "Anime" || item.media_type === "Donghua" ? "episodes" : "chapters"}</span>
                </div>
              </article>
            );
          }) : (
            <div className="state-panel state-compact">
              <Check size={22} />
              <h2>Inbox zero.</h2>
              <p>No stored tracker result is ahead of your manual progress.</p>
            </div>
          )}
        </section>

        <aside className="tracker-attention">
          <span>Tracker attention</span>
          <h3>{errors.length ? `${errors.length} ${errors.length === 1 ? "tracker needs" : "trackers need"} review` : "All trackers healthy"}</h3>
          <p>Errors do not change manual progress or erase last known releases.</p>
          <div>
            {errors.length ? errors.map((item) => (
              <button key={item._id} onClick={() => openModal(item)}>
                <AlertTriangle size={15} />
                <span><strong>{item.title}</strong><small>{item.last_scrape_error || "Tracker request failed"}</small></span>
              </button>
            )) : <div className="tracker-healthy"><Check size={16} /> No current tracker errors</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
