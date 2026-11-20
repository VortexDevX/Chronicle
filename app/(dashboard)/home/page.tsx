"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Layers3,
  Check,
  Clock3,
  FastForward,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
} from "lucide-react";
import type { HomePayload, MediaItem } from "@/types/media";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { CharacterArt } from "@/components/illustrations/CharacterArt";
import { MediaArtwork } from "@/components/MediaArtwork";
import { relativeTime } from "@/utils/format";
import { PageLoader } from "@/components/PageLoader";
import { formatProgress, progressSummary } from "@/utils/progress";
import styles from "./page.module.css";

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
  const [featured, setFeatured] = useState<MediaItem | null>(null);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [featureError, setFeatureError] = useState("");
  const [rotationCycle, setRotationCycle] = useState(0);
  const featureRequest = useRef<AbortController | null>(null);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const heroTicked = heroTickedId === featured?._id;

  const changeFeatured = useCallback(async () => {
    featureRequest.current?.abort();
    const controller = new AbortController();
    featureRequest.current = controller;
    setFeatureLoading(true);
    setFeatureError("");
    try {
      const query = featured ? `?exclude=${encodeURIComponent(featured._id)}` : "";
      const data = await apiRequest<{ featured: MediaItem | null }>(`/api/home/featured${query}`, { cache: "no-store", signal: controller.signal });
      if (!controller.signal.aborted) setFeatured(data.featured);
    } catch (error) {
      if (!controller.signal.aborted) setFeatureError(getErrorMessage(error, "Could not load another story. Try again."));
    } finally {
      if (featureRequest.current === controller) {
        featureRequest.current = null;
        setFeatureLoading(false);
        setRotationCycle((cycle) => cycle + 1);
      }
    }
  }, [featured]);

  useEffect(() => {
    const visibilityChanged = () => setPageVisible(!document.hidden);
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    if (!featured || rotationPaused || pendingId || panelOpen || !pageVisible) return;
    if (featureLoading) return;
    const timer = window.setTimeout(() => { void changeFeatured(); }, 30_000);
    return () => window.clearTimeout(timer);
  }, [featured, changeFeatured, rotationCycle, featureLoading, rotationPaused, pendingId, panelOpen, pageVisible]);

  useEffect(() => {
    if (rotationPaused || pendingId || panelOpen || !pageVisible) featureRequest.current?.abort();
  }, [rotationPaused, pendingId, panelOpen, pageVisible]);

  useEffect(() => () => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
    const request = featureRequest.current;
    featureRequest.current = null;
    request?.abort();
  }, []);

  const loadHome = useCallback(async () => {
    featureRequest.current?.abort();
    setError("");
    try {
      const data = await apiRequest<HomePayload>("/api/home", {
        cache: "no-store",
      });
      setPayload(data);
      setFeatured(data.featured);
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
    if (heroOptimisticProgress && featured?._id === heroOptimisticProgress.id && featured.progress_current >= heroOptimisticProgress.value) {
      setHeroOptimisticProgress(null);
    }
  }, [featured, heroOptimisticProgress]);

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

  const currentHeroProgress = featured ? (heroOptimisticProgress?.id === featured._id ? heroOptimisticProgress.value : featured.progress_current) : 0;
  const latest = featured?.latest_remote_progress ?? currentHeroProgress;
  const progress = featured ? progressSummary(featured, currentHeroProgress) : null;
  const week = payload?.rhythm ?? [];
  const activeDays = week.filter((day) => day.events > 0).length;
  const maximumEvents = Math.max(1, ...week.map((day) => day.events));
  const activityUnavailable = payload?.partial_failures?.includes("seven-day activity");
  const updatesUnavailable = payload?.partial_failures?.includes("updates");

  return (
    <div className={`${styles.journal} home-view`}>
      <header className={styles.header} data-motion-reveal>
        <div><h2>Your next chapter<span>.</span></h2><p>Pick up where you left off and see what’s been released.</p></div>
        <Link href="/library" className={styles.textLink}>Browse your library <ArrowRight size={17} /></Link>
      </header>
      {(error || payload?.partial_failures?.length) ? <div className="partial-notice" role="status"><RefreshCw size={15} /><span>{error || `Temporarily unavailable: ${payload?.partial_failures?.join(", ")}.`}</span><button onClick={loadHome}>Retry</button></div> : null}
      <div className={styles.spread}>
        <div className={styles.mainColumn}>
          {featured && progress ? (
            <section className={`${styles.feature} home-hero`} aria-label="Featured story" data-motion-reveal
              onFocusCapture={(event) => { if (!(event.target as HTMLElement).closest(".feature-rotation-controls")) setRotationPaused(true); }}
              onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".feature-rotation-controls")) setRotationPaused(true); }}>
              <div className={styles.sectionIndex}><span>Continue the story</span><span className={styles.format}>{featured.media_type}</span></div>
              <div className={styles.featurePage} key={featured._id}>
                <button className={styles.cover} onClick={() => openDetails(featured)} aria-label={`View details for ${featured.title}`}>
                  <MediaArtwork media={featured} priority />
                </button>
                <div className={`${styles.featureCopy} current-volume-copy`}>
                  <span className={styles.storyStatus}>{featured.status}{featured.rating ? ` · ★ ${featured.rating}/10` : ""}</span>
                  <h2><button onClick={() => openDetails(featured)}>{featured.title}</button></h2>
                  <div className={`${styles.progress} hero-progress`}>
                    <strong className={`progress-current-val ${heroTicked ? "is-ticked" : ""}`}>{progress.label}</strong>
                    {progress.knownTotal && (
                      <div className={styles.progressTrack} role="progressbar" aria-label={`Progress for ${featured.title}`}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? 0} aria-valuetext={progress.label}>
                        <i style={{ width: `${progress.percent}%` }} />
                      </div>
                    )}
                    {(!progress.knownTotal || featured.latest_remote_progress != null) && <p>{progress.availability}</p>}
                  </div>
                  {featured.hosted_novel_slug && <Link className={styles.readLink} href={`/read/${featured.hosted_novel_slug}/${Math.max(1, Math.min(featured.progress_total || 1, Math.floor(featured.progress_current || 1)))}`}><BookOpen size={16} /> Continue reading <ArrowRight size={15} /></Link>}
                  <div className={styles.featureActions}>
                    <button className={`hero-primary home-save ${heroTicked ? "is-saved" : ""}`} onClick={() => logNext(featured)} disabled={!!pendingId || progress.next <= currentHeroProgress}>
                      {pendingId === featured._id ? <span className="spinner" /> : heroTicked ? <Check size={17} /> : <Plus size={17} />}
                      <span>Log {shortUnit(featured.media_type)} {formatProgress(progress.next)}</span>
                    </button>
                    <button className={styles.detailsButton} onClick={() => openDetails(featured)} aria-label={`More about ${featured.title}`}><MoreHorizontal size={18} /></button>
                  </div>
                  {progress.unread > 1 && <button className={styles.catchUp} onClick={() => catchUp(featured, latest)} disabled={!!pendingId}><FastForward size={14} /> Catch up to {formatProgress(latest)}</button>}
                </div>
              </div>
              <div className={`${styles.rotation} feature-rotation-controls`} role="group" aria-label="Featured story rotation">
                <span>{rotationPaused ? "Rotation paused" : "A new pick every 30 seconds"}</span>
                <button onClick={() => setRotationPaused((paused) => !paused)} aria-label={rotationPaused ? "Resume featured rotation" : "Pause featured rotation"}>{rotationPaused ? <Play size={15} /> : <Pause size={15} />}</button>
                <button onClick={() => { void changeFeatured(); }} disabled={!!pendingId || featureLoading} aria-label="Another random story">{featureLoading ? <span className="spinner" /> : <Shuffle size={17} />}</button>
              </div>
              {featureError && <p className="story-save-error" role="status">{featureError}</p>}
            </section>
          ) : (
            <section className={styles.welcome} data-motion-reveal>
              <div className={styles.welcomeBody}>
                <div>
                  <h2>Make room for<br /><em>a new story.</em></h2>
                  <p>Add a title you’re watching or reading. It’ll appear here with your progress.</p>
                  <button className="btn-primary" onClick={() => openModal(null)}><Plus size={17} /> Add an active story</button>
                </div>
                <div className={styles.welcomeArt}>
                  <div className="theme-art-light"><CharacterArt character="frieren" variant="welcome" /></div>
                  <div className="theme-art-dark"><CharacterArt character="rukia" variant="welcome" /></div>
                </div>
              </div>
            </section>
          )}
          <section className={styles.queue} aria-labelledby="queue-title" data-motion-reveal>
            <div className={styles.heading}><h2 id="queue-title">Back to your stories</h2><span className={styles.caption}>By last activity</span></div>
            {payload?.continue_items.length ? <ol className={styles.queueList}>
              {payload.continue_items.map((media, index) => {
                const itemProgress = progressSummary(media);
                return <li key={media._id} className={`${styles.queueItem} queue-row`}>
                  <button className={styles.queueCover} onClick={() => openDetails(media)} aria-label={`View details for ${media.title}`}><MediaArtwork media={media} priority={index < 2} /></button>
                  <div className={`${styles.queueCopy} queue-copy`}>
                    <span>{media.media_type}</span>
                    <h3><button onClick={() => openDetails(media)}>{media.title}</button></h3>
                    <p>{itemProgress.label}</p>
                    {itemProgress.unread > 0 && <small>{formatProgress(itemProgress.unread)} {itemProgress.unit} unread</small>}
                  </div>
                  <button className={`${styles.queueLog} queue-log`} onClick={() => logNext(media)}
                    disabled={!!pendingId || itemProgress.next <= media.progress_current}
                    aria-label={`Log next for ${media.title}`} title={`Log ${itemProgress.shortUnit} ${formatProgress(itemProgress.next)}`}>
                    {pendingId === media._id ? <span className="spinner" /> : <Plus size={16} />}<span>Next</span>
                  </button>
                </li>;
              })}
            </ol> : <div className={styles.queueEmpty}><BookOpen size={24} /><p>No active stories yet.</p><Link href="/library">Open Library <ArrowRight size={15} /></Link></div>}
          </section>
          <nav className={styles.destinations} aria-label="Explore your story space" data-motion-reveal>
            <Link href="/novels"><BookOpen size={22} /><strong>Browse light novels</strong><ArrowRight size={18} /></Link>
            <Link href="/shelves"><Layers3 size={22} /><strong>Open shelves</strong><ArrowRight size={18} /></Link>
          </nav>
        </div>
        <aside className={styles.aside} aria-label="Your reading journal">
          <section className={styles.week} data-motion-reveal aria-labelledby="week-title">
            <div className={styles.heading}><h2 id="week-title">A week in stories</h2><span className={styles.caption}>Past 7 days</span></div>
            {activityUnavailable ? <p className={styles.emptyCopy}>Your activity is temporarily unavailable.</p> : <>
              <p className={styles.weekNumber}><strong>{activeDays}</strong><span>active {activeDays === 1 ? "day" : "days"}</span></p>
              {week.length > 0 && (
                <ol className={styles.weekChart} aria-label="Daily progress activity">
                  {week.map((day) => (
                    <li key={day.date} aria-label={`${day.date}: ${day.events} log entries`} title={`${day.date}: ${day.events} log entries`}>
                      <div><i style={{ height: `${Math.max(5, day.events / maximumEvents * 100)}%` }} data-active={day.events > 0} /></div>
                      <span aria-hidden="true">{new Date(day.date).toLocaleDateString("en", { weekday: "narrow", timeZone: "UTC" })}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Link className={styles.textLink} href="/analytics">View activity stats <ArrowRight size={15} /></Link>
            </>}
          </section>
          <section className={styles.desk} data-motion-reveal aria-labelledby="release-title">
            <div className={styles.heading}><h2 id="release-title">New releases</h2><Link href="/updates" aria-label="View all updates"><ArrowRight size={18} /></Link></div>
            {updatesUnavailable ? <p className={styles.emptyCopy}>Release updates are temporarily unavailable.</p> : payload?.updates.length ? (
              <div className={styles.releaseList}>
                {payload.updates.map((item) => (
                  <Link href="/updates" key={item._id} className={styles.release}>
                    <MediaArtwork media={item} />
                    <div><strong>{item.title}</strong><small>{shortUnit(item.media_type)} {formatProgress(item.latest_remote_progress ?? 0)} available</small></div>
                    <span>+{formatProgress(item.unread_delta)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className={styles.emptyCopy}>No unread releases from your trackers.</p>}
          </section>
          <section className={styles.log} data-motion-reveal aria-labelledby="log-title">
            <div className={styles.heading}><h2 id="log-title">Recent activity</h2></div>
            {activityUnavailable ? <p className={styles.emptyCopy}>Your reading log is temporarily unavailable.</p> : payload?.activity.length ? (
              <ol className={styles.timeline}>
                {payload.activity.map((event) => (
                  <li key={event._id}>
                    <span className={styles.timelineDot} aria-hidden="true" />
                    <div><strong>{event.title}</strong><small><Clock3 size={11} /> {relativeTime(event.occurred_at)}</small></div>
                    <span>{event.delta > 0 ? "+" : ""}{formatProgress(event.delta)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.emptyCopy}>No episodes or chapters logged this week.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
