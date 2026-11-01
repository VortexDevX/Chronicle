"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FastForward,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { HomePayload, MediaItem } from "@/types/media";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { MediaArtwork } from "@/components/MediaArtwork";
import {
  relativeTime,
} from "@/utils/format";
import { PageLoader } from "@/components/PageLoader";
import { formatProgress, progressSummary } from "@/utils/progress";

function progressUnit(mediaType: string) {
  return mediaType === "Anime" || mediaType === "Donghua"
    ? "episode"
    : "chapter";
}

function shortUnit(mediaType: string) {
  return mediaType === "Anime" || mediaType === "Donghua" ? "Ep" : "Ch";
}

export default function HomePage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const openDetails = useMediaStore((state) => state.openDetails);
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const panelOpen = useMediaStore((state) => state.modalOpen || state.settingsOpen || !!state.detailsMedia);
  const { toast, confirm } = useFeedback();
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [heroOptimisticProgress, setHeroOptimisticProgress] = useState<{ id: string; value: number } | null>(null);
  const [heroTickedId, setHeroTickedId] = useState<string | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const featuredItems = useMemo(() => {
    const items = payload?.featured_items?.length ? payload.featured_items : [payload?.featured, ...(payload?.continue_items || [])];
    return [...new Map(items.filter((item): item is MediaItem => !!item).map((item) => [item._id, item])).values()];
  }, [payload]);
  const featuredIndex = Math.max(0, featuredItems.findIndex((item) => item._id === featuredId));
  const featured = featuredItems[featuredIndex] || null;
  const heroTicked = heroTickedId === featured?._id;

  const changeFeatured = useCallback((direction: number) => {
    setFeaturedId((current) => {
      const index = Math.max(0, featuredItems.findIndex((item) => item._id === current));
      return featuredItems[(index + direction + featuredItems.length) % featuredItems.length]?._id || null;
    });
  }, [featuredItems]);

  useEffect(() => {
    const visibilityChanged = () => setPageVisible(!document.hidden);
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    if (featuredItems.length < 2 || rotationPaused || pendingId || panelOpen || !pageVisible) return;
    const timer = window.setTimeout(() => changeFeatured(1), 5000);
    return () => window.clearTimeout(timer);
  }, [featured?._id, featuredItems.length, changeFeatured, rotationPaused, pendingId, panelOpen, pageVisible]);

  useEffect(() => () => { if (tickTimer.current) clearTimeout(tickTimer.current); }, []);

  const loadHome = useCallback(async () => {
    setError("");
    try {
      const data = await apiRequest<HomePayload>("/api/home", {
        cache: "no-store",
      });
      setPayload(data);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load Home"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveRoute("home");
    loadHome();
  }, [loadHome, setActiveRoute, mediaRev]);

  useEffect(() => {
    const feat = featuredItems.find((item) => item._id === heroOptimisticProgress?.id);
    if (heroOptimisticProgress && feat && feat.progress_current >= heroOptimisticProgress.value) {
      setHeroOptimisticProgress(null);
    }
  }, [featuredItems, heroOptimisticProgress]);

  const triggerHeroTick = (id: string) => {
    setHeroTickedId(id);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setHeroTickedId(null), 320);
  };

  const logNext = async (media: MediaItem, propagateError = false) => {
    if (pendingId) {
      if (propagateError) throw new Error("Another progress update is still saving. Try again.");
      return;
    }
    const isFeatured = media._id === featured?._id;
    const currentVal = isFeatured && heroOptimisticProgress?.id === media._id
      ? heroOptimisticProgress.value
      : media.progress_current;
    const nextProgress =
      media.progress_total > 0
        ? Math.min(media.progress_total, currentVal + 1)
        : currentVal + 1;
    if (nextProgress === currentVal) {
      toast(`${media.title} is already complete`, "info");
      return;
    }

    if (isFeatured) {
      setHeroOptimisticProgress({ id: media._id, value: nextProgress });
    }

    setPendingId(media._id);
    try {
      await apiRequest(`/api/media?id=${media._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: nextProgress }),
      });
      if (isFeatured) triggerHeroTick(media._id);
      refreshMedia();
      await loadHome();
    } catch (err) {
      if (isFeatured) setHeroOptimisticProgress(null);
      toast(getErrorMessage(err, "Progress update failed"), "error");
      if (propagateError) throw err;
    } finally {
      setPendingId(null);
    }
  };

  const catchUp = async (media: MediaItem, targetProgress: number) => {
    if (pendingId) return;
    const approved = await confirm({
      title: `Catch up ${media.title}?`,
      message: `Advance progress from ${media.progress_current} to ${targetProgress} ${progressUnit(media.media_type)}s?`,
      confirmLabel: `Catch up to ${targetProgress}`,
    });
    if (!approved) return;

    const isFeatured = media._id === featured?._id;
    if (isFeatured) {
      setHeroOptimisticProgress({ id: media._id, value: targetProgress });
    }

    setPendingId(media._id);
    try {
      await apiRequest(`/api/media?id=${media._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: targetProgress }),
      });
      if (isFeatured) triggerHeroTick(media._id);
      toast(`Caught up ${media.title} to ${targetProgress}`, "success");
      refreshMedia();
      await loadHome();
    } catch (err) {
      if (isFeatured) setHeroOptimisticProgress(null);
      toast(getErrorMessage(err, "Catch up failed"), "error");
    } finally {
      setPendingId(null);
    }
  };

  if (loading && !payload) {
    return <PageLoader label="Building your Home" detail="Finding what moved" compact />;
  }

  if (error && !payload) {
    return (
      <section className="state-panel state-error">
        <RefreshCw size={24} />
        <h2>Home could not load.</h2>
        <p>{error}</p>
        <button className="btn-primary" onClick={() => { setLoading(true); loadHome(); }}>
          Try again
        </button>
      </section>
    );
  }

  if (!featured) {
    return (
      <section className="home-empty">
        <div className="home-empty-icon"><Sparkles size={32} /></div>
        <span>Your personal story index</span>
        <h2>Build a library worth returning to.</h2>
        <p>Add an active title, then Chronicle will bring progress, releases, and activity into one place.</p>
        <div className="home-empty-actions">
          <button className="btn-primary" onClick={() => openModal(null)}>
            <Plus size={17} /> Add entry
          </button>
          <Link className="btn-ghost" href="/library">Open Library</Link>
        </div>
      </section>
    );
  }

  const currentHeroProgress = heroOptimisticProgress?.id === featured._id ? heroOptimisticProgress.value : featured.progress_current;
  const latest = featured.latest_remote_progress ?? currentHeroProgress;
  const progress = progressSummary(featured, currentHeroProgress);
  const unread = progress.unread;


  return (
    <div className="home-view">
      <div className="page-intro home-intro"><div><span className="section-eyebrow">Your personal story index</span><h2>In progress<span className="title-stop">.</span></h2></div><Link href="/library" className="index-link">Explore Library <ArrowRight size={17} /></Link></div>
      {payload?.partial_failures?.length ? (
        <div className="partial-notice">
          <RefreshCw size={15} />
          Some panels are temporarily unavailable: {payload.partial_failures.join(", ")}.
          <button onClick={loadHome}>Retry</button>
        </div>
      ) : null}

      <div className="reading-board">
        <section className="current-volume home-hero" aria-label="Featured story" aria-roledescription="carousel"
          onFocusCapture={(event) => { if (!(event.target as HTMLElement).closest(".feature-rotation-controls")) setRotationPaused(true); }}
          onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".feature-rotation-controls")) setRotationPaused(true); }}>
          <div className="index-section-label"><span>On rotation</span><span>{featured.media_type}</span></div>
          <button className="current-volume-cover" onClick={() => openDetails(featured)} aria-label={`View details for ${featured.title}`}><MediaArtwork key={featured._id} media={featured} priority />
            <span className="volume-progress-stamp">{shortUnit(featured.media_type)}<strong>{formatProgress(currentHeroProgress)}</strong></span>
          </button>
          <div className="current-volume-copy">
            <h2><button onClick={() => openDetails(featured)}>{featured.title}</button></h2>
            <div className="current-volume-meta"><span>{featured.status}</span>{featured.rating ? <span>★ {featured.rating}/10</span> : null}</div>
            <div className="hero-progress">
              <strong className={`progress-current-val ${heroTicked ? "is-ticked" : ""}`}>{progress.label}</strong>
              {progress.knownTotal && <div className="progress-track"><i style={{ width: `${progress.percent}%` }} /></div>}
              <p className="hero-availability">{progress.availability}</p>
            </div>
            <div className="hero-actions">
              <button className="hero-primary" onClick={() => logNext(featured)} disabled={!!pendingId || progress.next <= currentHeroProgress}>
                {pendingId === featured._id ? <span className="spinner" /> : heroTicked ? <Check size={17} /> : <Plus size={17} />}
                Log {shortUnit(featured.media_type)} {formatProgress(progress.next)}
              </button>
              <button className="hero-secondary volume-details" onClick={() => openDetails(featured)} aria-label={`More about ${featured.title}`}><MoreHorizontal size={18} /></button>
            </div>
            {unread > 1 && <button className="volume-catchup" onClick={() => catchUp(featured, latest)} disabled={!!pendingId}><FastForward size={14} /> Catch up to {formatProgress(latest)}</button>}
          </div>
          {featuredItems.length > 1 && <div className="feature-rotation-controls" role="group" aria-label="Featured story rotation">
            <span>{String(featuredIndex + 1).padStart(2, "0")} / {String(featuredItems.length).padStart(2, "0")}</span>
            <button onClick={() => { setRotationPaused(true); changeFeatured(-1); }} disabled={!!pendingId} aria-label="Previous featured story"><ChevronLeft size={17} /></button>
            <button onClick={() => setRotationPaused((paused) => !paused)} aria-label={rotationPaused ? "Resume featured rotation" : "Pause featured rotation"}>{rotationPaused ? <Play size={15} /> : <Pause size={15} />}</button>
            <button onClick={() => { setRotationPaused(true); changeFeatured(1); }} disabled={!!pendingId} aria-label="Next featured story"><ChevronRight size={17} /></button>
          </div>}
          {featuredItems.length > 1 && <div className="feature-preload" aria-hidden="true"><MediaArtwork key={featuredItems[(featuredIndex + 1) % featuredItems.length]._id} media={featuredItems[(featuredIndex + 1) % featuredItems.length]} priority /></div>}
        </section>
        <section className="reading-queue" aria-labelledby="queue-title">
          <div className="index-section-label"><h3 id="queue-title">Recently active</h3><span>By last activity</span></div>
          <ol className="reading-queue-list">
            {payload?.continue_items.map((media, index) => {
              const itemProgress = progressSummary(media);
              return <li key={media._id} className="queue-row">
                <span className="queue-position" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <button className="queue-cover" onClick={() => openDetails(media)} aria-label={`View details for ${media.title}`}><MediaArtwork media={media} priority={index < 2} /></button>
                <div className="queue-copy"><span>{media.media_type}</span><h3><button onClick={() => openDetails(media)}>{media.title}</button></h3><p>{itemProgress.label}</p>{itemProgress.unread > 0 && <small>{formatProgress(itemProgress.unread)} {itemProgress.unit} unread</small>}</div>
                <button className="queue-log" onClick={() => logNext(media)} disabled={!!pendingId || itemProgress.next <= media.progress_current} aria-label={`Log next for ${media.title}`} title={`Log ${itemProgress.shortUnit} ${formatProgress(itemProgress.next)}`}>{pendingId === media._id ? <span className="spinner" /> : <Plus size={18} />}<span>+1</span></button>
              </li>;
            })}
          </ol>
          {!payload?.continue_items.length && <p className="panel-empty">Your recently active stories will appear here.</p>}
          <Link className="queue-library-link" href="/library">Open the full collection <ArrowRight size={17} /></Link>
          <div className="queue-rhythm"><div><span className="section-eyebrow">Past 7 days</span><strong>{payload?.rhythm.filter((day) => day.events > 0).length || 0}<small> active days</small></strong></div><div className="rhythm-strip" aria-label="Seven-day activity">{payload?.rhythm.map((day) => <i key={day.date} data-active={day.events > 0 ? "true" : "false"} title={`${day.date}: ${formatProgress(day.units)} units`} />)}</div></div>
        </section>
      </div>

      {/* Dashboard Panels: New Releases & Activity */}
      <div className="home-dashboard">
        <section className="home-panel">
          <div className="section-heading compact">
            <div>
              <h2>Release desk</h2>
              <span>{payload?.updates.length || 0} recent updates</span>
            </div>
            <Link href="/updates">
              Open Updates <ArrowRight size={14} />
            </Link>
          </div>
          <div className="home-update-list">
            {payload?.updates.length ? (
              payload.updates.map((item) => (
                <Link href="/updates" key={item._id} className="home-update-item">
                  <MediaArtwork media={item} />
                  <div className="update-item-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {shortUnit(item.media_type)}{" "}
                      {formatProgress(item.latest_remote_progress || 0)} available
                    </small>
                  </div>
                  <em>+{formatProgress(progressSummary(item).unread)}</em>
                </Link>
              ))
            ) : (
              <p className="panel-empty">Nothing new. You are caught up.</p>
            )}
          </div>
        </section>

        <section className="home-panel">
          <div className="section-heading compact">
            <div>
              <h2>Reading log</h2>
              <span>Real progress · last 7 days</span>
            </div>
            <span className="rhythm-label">
              {payload?.rhythm.filter((day) => day.events > 0).length || 0} active days
            </span>
          </div>
          <div className="activity-list">
            {payload?.activity.length ? (
              payload.activity.map((event) => (
                <div key={event._id} className="activity-row">
                  <span className="activity-mark">{event.title.charAt(0)}</span>
                  <div className="activity-copy">
                    <strong>{event.title}</strong>
                    <small>
                      <Clock3 size={11} /> {relativeTime(event.occurred_at)}
                    </small>
                  </div>
                  <em>
                    {event.delta > 0 ? "+" : ""}
                    {formatProgress(event.delta)}
                  </em>
                </div>
              ))
            ) : (
              <p className="panel-empty">Progress you log will appear here.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
