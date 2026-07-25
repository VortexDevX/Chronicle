"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BellRing,
  Clock3,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { HomePayload, MediaItem } from "@/types/media";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useFeedback } from "@/components/FeedbackProvider";
import { MediaArtwork } from "@/components/MediaArtwork";
import { MediaCard } from "@/components/MediaCard";
import { relativeTime } from "@/utils/format";
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

export default function HomePage() {
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const openModal = useMediaStore((state) => state.openModal);
  const refreshMedia = useMediaStore((state) => state.refreshMedia);
  const { toast, confirm } = useFeedback();
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

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
        <span>Your next story starts here</span>
        <h2>Build a library worth returning to.</h2>
        <p>Add an active title, then Chronicle will bring progress, releases, and activity into one place.</p>
        <div>
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

  return (
    <div className="home-view">
      {payload?.partial_failures?.length ? (
        <div className="partial-notice">
          <RefreshCw size={15} />
          Some panels are temporarily unavailable: {payload.partial_failures.join(", ")}.
          <button onClick={loadHome}>Retry</button>
        </div>
      ) : null}
      <section className="home-hero">
        <MediaArtwork media={featured} className="home-hero-art" priority />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <span className="hero-kicker"><i /> Continue {progressUnit(featured.media_type) === "episode" ? "watching" : "reading"}</span>
          <h2>{featured.title}</h2>
          <div className="hero-meta">
            <span>{featured.media_type}</span>
            <span>{featured.status}</span>
            {featured.rating ? <span>★ {featured.rating}</span> : null}
          </div>
          <div className="hero-progress">
            <div>
              <span>{formatProgress(featured.progress_current)} of {featured.progress_total || "—"} {progressUnit(featured.media_type)}s</span>
              <strong>{Math.round(pct)}%</strong>
            </div>
            <div className="progress-track"><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="hero-actions">
            <button
              className="hero-primary"
              onClick={() => logNext(featured)}
              disabled={pendingId === featured._id}
            >
              {pendingId === featured._id ? <span className="spinner" /> : <Play size={17} fill="currentColor" />}
              Log next {progressUnit(featured.media_type)}
            </button>
            <button className="hero-secondary" onClick={() => openModal(featured)}>
              <MoreHorizontal size={18} /> Details
            </button>
          </div>
        </div>
        <div className="hero-release-card">
          <span>Latest available</span>
          <strong>{formatProgress(latest)}</strong>
          <small>{progressUnit(featured.media_type)}s</small>
          <hr />
          <p><BellRing size={14} /> {unread > 0 ? `${formatProgress(unread)} new` : "Caught up"}</p>
        </div>
      </section>

      <section className="home-shelf">
        <div className="section-heading">
          <div>
            <h2>Continue your journey</h2>
            <span>{payload?.continue_items.length || 0} active stories</span>
          </div>
          <Link href="/library">View Library <ArrowRight size={15} /></Link>
        </div>
        <div className="media-rail">
          {payload?.continue_items.map((media, index) => (
            <MediaCard
              key={media._id}
              m={media}
              priority={index < 3}
              onEdit={openModal}
              onIncrement={() => logNext(media)}
              onDelete={() => deleteEntry(media)}
            />
          ))}
        </div>
      </section>

      <div className="home-dashboard">
        <section className="home-panel">
          <div className="section-heading compact">
            <div><h2>New releases</h2><span>{payload?.updates.length || 0} need attention</span></div>
            <Link href="/updates">Open Updates <ArrowRight size={14} /></Link>
          </div>
          <div className="home-update-list">
            {payload?.updates.length ? payload.updates.map((item) => (
              <Link href="/updates" key={item._id}>
                <MediaArtwork media={item} />
                <span><strong>{item.title}</strong><small>{formatProgress(item.latest_remote_progress || 0)} available</small></span>
                <em>+{formatProgress(item.unread_delta)}</em>
              </Link>
            )) : <p className="panel-empty">Nothing new. You are caught up.</p>}
          </div>
        </section>

        <section className="home-panel">
          <div className="section-heading compact">
            <div><h2>Recent activity</h2><span>Real progress · last 7 days</span></div>
            <span className="rhythm-label">{payload?.rhythm.filter((day) => day.events > 0).length || 0} active days</span>
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
            {payload?.activity.length ? payload.activity.map((event) => (
              <div key={event._id}>
                <span className="activity-mark">{event.title.charAt(0)}</span>
                <span><strong>{event.title}</strong><small><Clock3 size={11} /> {relativeTime(event.occurred_at)}</small></span>
                <em>{event.delta > 0 ? "+" : ""}{formatProgress(event.delta)}</em>
              </div>
            )) : <p className="panel-empty">Progress you log now will appear here.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
