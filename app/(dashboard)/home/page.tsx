"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Clock3,
  FastForward,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import type { HomePayload, MediaItem } from "@/types/media";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { MediaArtwork } from "@/components/MediaArtwork";
import { MediaCard } from "@/components/MediaCard";
import {
  formatReleaseCountdown,
  formatReleaseSchedule,
  relativeTime,
} from "@/utils/format";
import { PageLoader } from "@/components/PageLoader";

function formatProgress(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

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
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const { toast, confirm } = useFeedback();
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
  }, [loadHome, setActiveRoute]);

  const logNext = async (media: MediaItem) => {
    if (pendingId) return;
    const nextProgress =
      media.progress_total > 0
        ? Math.min(media.progress_total, media.progress_current + 1)
        : media.progress_current + 1;
    if (nextProgress === media.progress_current) {
      toast(`${media.title} is already complete`, "info");
      return;
    }

    setPendingId(media._id);
    try {
      await apiRequest(`/api/media?id=${media._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: nextProgress }),
      });
      toast(`${media.title} +1 ${progressUnit(media.media_type)}`, "success");
      refreshMedia();
      await loadHome();
    } catch (err) {
      toast(getErrorMessage(err, "Progress update failed"), "error");
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

    setPendingId(media._id);
    try {
      await apiRequest(`/api/media?id=${media._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_current: targetProgress }),
      });
      toast(`Caught up ${media.title} to ${targetProgress}`, "success");
      refreshMedia();
      await loadHome();
    } catch (err) {
      toast(getErrorMessage(err, "Catch up failed"), "error");
    } finally {
      setPendingId(null);
    }
  };

  const deleteEntry = async (media: MediaItem) => {
    const approved = await confirm({
      title: "Delete entry?",
      message: `${media.title} and its seven-day activity will be removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!approved) return;

    try {
      await apiRequest(`/api/media?id=${media._id}`, { method: "DELETE" });
      toast("Entry deleted", "success");
      refreshMedia();
      await loadHome();
    } catch (err) {
      toast(getErrorMessage(err, "Delete failed"), "error");
    }
  };

  // Next up rail items: upcoming scheduled releases within the next 3 days
  const upcomingReleases = useMemo(() => {
    const source = payload?.upcoming_releases ?? payload?.continue_items ?? [];
    if (!now) {
      return source.slice(0, 6);
    }
    const threeDaysMs = 3 * 86_400_000;
    const maxReleaseTime = now + threeDaysMs;

    return source
      .filter((item) => {
        if (!item.next_episode_release_at) return false;
        const releaseTime = new Date(item.next_episode_release_at).getTime();
        return (
          !isNaN(releaseTime) &&
          releaseTime >= now - 60 * 60_000 &&
          releaseTime <= maxReleaseTime
        );
      })
      .sort((a, b) => {
        const timeA = new Date(a.next_episode_release_at!).getTime();
        const timeB = new Date(b.next_episode_release_at!).getTime();
        return timeA - timeB;
      })
      .slice(0, 6);
  }, [payload, now]);

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

  const featured = payload?.featured || null;
  if (!featured) {
    return (
      <section className="home-empty">
        <div className="home-empty-icon"><Sparkles size={32} /></div>
        <span>Your personal command center</span>
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

  const latest = featured.latest_remote_progress ?? featured.progress_current;
  const unread = Math.max(0, latest - featured.progress_current);
  const pct =
    featured.progress_total > 0
      ? Math.min(100, (featured.progress_current / featured.progress_total) * 100)
      : 0;

  const isScreenMedia = featured.media_type === "Anime" || featured.media_type === "Donghua";
  const heroHasSchedule =
    isScreenMedia &&
    Boolean(featured.next_episode_release_at) &&
    !isNaN(new Date(featured.next_episode_release_at || "").getTime());
  const heroScheduleText = heroHasSchedule
    ? formatReleaseSchedule(featured.next_episode_release_at!)
    : null;
  const heroCountdownText = heroHasSchedule
    ? formatReleaseCountdown(featured.next_episode_release_at!)
    : null;

  return (
    <div className="home-view">
      {payload?.partial_failures?.length ? (
        <div className="partial-notice">
          <RefreshCw size={15} />
          Some panels are temporarily unavailable: {payload.partial_failures.join(", ")}.
          <button onClick={loadHome}>Retry</button>
        </div>
      ) : null}

      {/* Hero Section */}
      <section className="home-hero">
        <MediaArtwork media={featured} className="home-hero-art" priority />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <span className="hero-kicker">
            <i /> CONTINUE {isScreenMedia ? "WATCHING" : "READING"}
          </span>
          <h2>{featured.title}</h2>
          <div className="hero-meta">
            <span className="hero-type-tag">{featured.media_type}</span>
            <span>{featured.status}</span>
            {featured.rating ? <span>★ {featured.rating}</span> : null}
          </div>

          <div className="hero-progress">
            <div className="hero-progress-labels">
              <span>
                {formatProgress(featured.progress_current)} of{" "}
                {featured.progress_total ? formatProgress(featured.progress_total) : "—"}{" "}
                {progressUnit(featured.media_type)}s
              </span>
              <strong>{Math.round(pct)}%</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="hero-actions">
            {unread > 1 ? (
              <button
                className="hero-primary hero-catchup"
                onClick={() => catchUp(featured, latest)}
                disabled={pendingId === featured._id}
              >
                {pendingId === featured._id ? (
                  <span className="spinner" />
                ) : (
                  <FastForward size={17} />
                )}
                Catch up to {shortUnit(featured.media_type)} {formatProgress(latest)}
              </button>
            ) : (
              <button
                className="hero-primary"
                onClick={() => logNext(featured)}
                disabled={pendingId === featured._id}
              >
                {pendingId === featured._id ? (
                  <span className="spinner" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
                Log {shortUnit(featured.media_type)}{" "}
                {formatProgress(featured.progress_current + 1)}
              </button>
            )}
            <button className="hero-secondary" onClick={() => openModal(featured)}>
              <MoreHorizontal size={18} /> Details
            </button>
          </div>
        </div>

        <div className="hero-release-card">
          {heroHasSchedule ? (
            <>
              <span className="hero-card-kicker">Next episode</span>
              <strong>Episode {featured.next_episode || "Next"}</strong>
              <small>{heroScheduleText}</small>
              <hr />
              <p>
                <Clock3 size={14} /> {heroCountdownText}
              </p>
            </>
          ) : (
            <>
              <span className="hero-card-kicker">Latest available</span>
              <strong>{formatProgress(latest)}</strong>
              <small>{progressUnit(featured.media_type)}s</small>
              <hr />
              <p>
                <BellRing size={14} />{" "}
                {unread > 0 ? `+${formatProgress(unread)} new` : "Caught up"}
              </p>
            </>
          )}
        </div>
      </section>

      {/* Today Orientation Strip */}
      <section className="home-today-strip" aria-label="Today summary">
        <div className="today-item">
          <Zap size={16} className="today-icon accent" />
          <div>
            <strong>{payload?.updates.length || 0} unread</strong>
            <span>titles ready to catch up</span>
          </div>
        </div>
        <div className="today-item">
          <CalendarDays size={16} className="today-icon info" />
          <div>
            <strong>{upcomingReleases.length} upcoming</strong>
            <span>next 3 days</span>
          </div>
        </div>
        <div className="today-item">
          <Clock3 size={16} className="today-icon green" />
          <div>
            <strong>
              {payload?.rhythm.filter((day) => day.events > 0).length || 0} active days
            </strong>
            <span>past 7 days</span>
          </div>
        </div>
      </section>

      {/* Next Up Rail (if scheduled items exist) */}
      {upcomingReleases.length > 0 && (
        <section className="home-next-up">
          <div className="section-heading compact">
            <div>
              <h2>Next up</h2>
              <span>Next 3 days</span>
            </div>
            <Link href="/queue">
              View Radar <ArrowRight size={14} />
            </Link>
          </div>
          <div className="next-up-grid">
            {upcomingReleases.map((item) => (
              <div
                key={item._id}
                className="next-up-card"
                onClick={() => openModal(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openModal(item);
                }}
              >
                <MediaArtwork media={item} className="next-up-art" />
                <div className="next-up-info">
                  <strong>{item.title}</strong>
                  <span>
                    Ep {item.next_episode} ·{" "}
                    {formatReleaseSchedule(item.next_episode_release_at!)}
                  </span>
                </div>
                <div className="next-up-when">
                  <Clock3 size={12} />
                  <span>{formatReleaseCountdown(item.next_episode_release_at!)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Continue Rail */}
      <section className="home-shelf">
        <div className="section-heading">
          <div>
            <h2>Continue your journey</h2>
            <span>{payload?.continue_items.length || 0} active stories</span>
          </div>
          <Link href="/library">
            View Library <ArrowRight size={15} />
          </Link>
        </div>
        <div className="media-rail">
          {payload?.continue_items.map((media, index) => (
            <MediaCard
              key={media._id}
              m={media}
              priority={index < 3}
              onEdit={openModal}
              onIncrement={() => logNext(media)}
              onCatchUp={(_id, target) => catchUp(media, target)}
              onDelete={() => deleteEntry(media)}
            />
          ))}
        </div>
      </section>

      {/* Dashboard Panels: New Releases & Activity */}
      <div className="home-dashboard">
        <section className="home-panel">
          <div className="section-heading compact">
            <div>
              <h2>New releases</h2>
              <span>{payload?.updates.length || 0} need attention</span>
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
                  <em>+{formatProgress(item.unread_delta)}</em>
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
              <h2>Recent activity</h2>
              <span>Real progress · last 7 days</span>
            </div>
            <span className="rhythm-label">
              {payload?.rhythm.filter((day) => day.events > 0).length || 0} active days
            </span>
          </div>
          <div className="rhythm-strip" aria-label="Seven-day activity">
            {payload?.rhythm.map((day) => (
              <i
                key={day.date}
                data-active={day.events > 0 ? "true" : "false"}
                title={`${day.date}: ${formatProgress(day.units)} units`}
              />
            ))}
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
