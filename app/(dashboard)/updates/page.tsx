"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  FastForward,
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

function progressUnit(mediaType: string) {
  return mediaType === "Anime" || mediaType === "Donghua"
    ? "episodes"
    : "chapters";
}

function shortUnit(mediaType: string) {
  return mediaType === "Anime" || mediaType === "Donghua" ? "Ep" : "Ch";
}

const TELEGRAM_COPY = {
  fully_notified: { label: "Telegram notified", icon: Check },
  previously_notified: { label: "Newer release pending", icon: BellRing },
  not_notified: { label: "Unnotified", icon: BellOff },
} as const;

export default function UpdatesPage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const { toast, confirm } = useFeedback();
  const [payload, setPayload] = useState<UpdatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [catchingUpAll, setCatchingUpAll] = useState(false);

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
      toast(`${item.title} +1 ${shortUnit(item.media_type)}`, "success");
      refreshMedia();
      await loadUpdates();
    } catch (err) {
      toast(getErrorMessage(err, "Progress update failed"), "error");
    } finally {
      setPendingId(null);
    }
  };

  const catchUp = async (item: MediaItem, targetProgress: number) => {
    if (pendingId) return;
    const approved = await confirm({
      title: `Catch up ${item.title}?`,
      message: `Advance progress from ${item.progress_current} to ${targetProgress} ${progressUnit(item.media_type)}?`,
      confirmLabel: `Catch up to ${targetProgress}`,
    });
    if (!approved) return;

    setPendingId(item._id);
    try {
      await apiRequest(`/api/media?id=${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: targetProgress }),
      });
      toast(`Caught up ${item.title} to ${targetProgress}`, "success");
      refreshMedia();
      await loadUpdates();
    } catch (err) {
      toast(getErrorMessage(err, "Catch up failed"), "error");
    } finally {
      setPendingId(null);
    }
  };

  const catchUpAll = async () => {
    const items = payload?.items || [];
    if (!items.length || catchingUpAll) return;

    const approved = await confirm({
      title: "Mark all caught up?",
      message: `Advance ${items.length} title${items.length === 1 ? "" : "s"} to their latest known release?`,
      confirmLabel: "Mark all caught up",
    });
    if (!approved) return;

    setCatchingUpAll(true);
    let successCount = 0;
    try {
      for (const item of items) {
        const target = item.latest_remote_progress ?? item.progress_current;
        if (target > item.progress_current) {
          try {
            await apiRequest(`/api/media?id=${item._id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ progress_current: target }),
            });
            successCount++;
          } catch {
            // continue with others
          }
        }
      }
      toast(`Caught up ${successCount} titles`, "success");
      refreshMedia();
      await loadUpdates();
    } finally {
      setCatchingUpAll(false);
    }
  };

  const breakdown = useMemo(() => {
    const items = payload?.items || [];
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.media_type] = (counts[item.media_type] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => `${count} ${type.toLowerCase()}`)
      .join(" · ");
  }, [payload?.items]);

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

      {/* Updates Header Inbox Summary */}
      <section className="updates-summary">
        <div className="updates-summary-main">
          <div className="updates-orbit"><BellRing size={22} /><i /></div>
          <div className="updates-summary-text">
            <span>Updates Inbox</span>
            <h2>
              {items.length
                ? `${items.length} ${items.length === 1 ? "title has" : "titles have"} new releases`
                : "You are fully caught up"}
            </h2>
            <p>
              {breakdown ? `${breakdown} · ` : ""}
              Manual progress stays authoritative.
            </p>
          </div>
        </div>
        <div className="updates-summary-actions">
          {items.length > 0 && (
            <button
              className="btn-ghost updates-catchup-all"
              onClick={catchUpAll}
              disabled={catchingUpAll}
              title="Mark all updates caught up"
            >
              {catchingUpAll ? <span className="spinner" /> : <CheckCheck size={16} />}
              <span>Mark all caught up</span>
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => { setLoading(true); loadUpdates(); }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      <div className="updates-layout">
        <section className="updates-feed">
          <div className="section-heading">
            <div><span>Unread releases</span><h2>Ready when you are</h2></div>
            <strong>{items.length}</strong>
          </div>
          {items.length ? (
            items.map((item: UpdateFeedItem) => {
              const telegram = TELEGRAM_COPY[item.telegram_state];
              const TelegramIcon = telegram.icon;
              const isScreenMedia = item.media_type === "Anime" || item.media_type === "Donghua";
              const trackerUrl = item.tracker_url ? normalizePublicHttpUrl(item.tracker_url) : null;
              const latestRemote = item.latest_remote_progress ?? item.progress_current;
              const hasMultiple = item.unread_delta > 1;

              return (
                <article className="update-row" key={item._id}>
                  <MediaArtwork media={item} className="update-row-art" />
                  <div className="update-row-main">
                    <div className="update-row-meta">
                      <span className="meta-tag">{item.media_type}</span>
                      <span>
                        <Clock3 size={11} />{" "}
                        {item.last_checked_at ? relativeTime(item.last_checked_at) : "Recently"}
                      </span>
                      <span data-telegram={item.telegram_state} title={telegram.label}>
                        <TelegramIcon size={11} /> {telegram.label}
                      </span>
                    </div>

                    <h3>{item.title}</h3>

                    <p className="update-row-progress-info">
                      You: <strong>{formatProgress(item.progress_current)}</strong> · Latest:{" "}
                      <strong>{formatProgress(latestRemote)}</strong>
                    </p>

                    <div className="update-row-actions">
                      {hasMultiple ? (
                        <>
                          <button
                            className="btn-primary"
                            onClick={() => catchUp(item, latestRemote)}
                            disabled={pendingId === item._id}
                          >
                            {pendingId === item._id ? (
                              <span className="spinner" />
                            ) : (
                              <FastForward size={15} />
                            )}
                            Catch up to {formatProgress(latestRemote)}
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => logNext(item)}
                            disabled={pendingId === item._id}
                          >
                            +1
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() => logNext(item)}
                          disabled={pendingId === item._id}
                        >
                          {pendingId === item._id ? (
                            <span className="spinner" />
                          ) : (
                            <Plus size={15} />
                          )}
                          Log {shortUnit(item.media_type)} {formatProgress(latestRemote)}
                        </button>
                      )}

                      <button className="btn-ghost" onClick={() => openModal(item)}>
                        Edit
                      </button>

                      {trackerUrl && (
                        <a
                          className="btn-ghost"
                          href={trackerUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={isScreenMedia ? "Open watch link" : "Open tracker"}
                        >
                          <ExternalLink size={14} /> {isScreenMedia ? "Watch" : "Tracker"}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="update-delta">
                    <strong>+{formatProgress(item.unread_delta)}</strong>
                    <span>{progressUnit(item.media_type)}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="state-panel state-compact">
              <Check size={24} />
              <h2>Inbox zero.</h2>
              <p>No stored tracker result is ahead of your manual progress. You are caught up!</p>
            </div>
          )}
        </section>

        <aside className="tracker-attention">
          <span>Tracker health</span>
          <h3>
            {errors.length
              ? `${errors.length} ${errors.length === 1 ? "tracker needs" : "trackers need"} review`
              : "All trackers healthy"}
          </h3>
          <p>Scraper issues never affect your manual progress.</p>
          <div>
            {errors.length ? (
              errors.map((item) => (
                <button
                  key={item._id}
                  onClick={() => openModal(item)}
                  className="tracker-error-btn"
                  title="Click to edit entry"
                >
                  <AlertTriangle size={15} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.last_scrape_error || "Tracker request failed"}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="tracker-healthy">
                <Check size={16} /> No scraper errors
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
