"use client";

import { CalendarDays, Clock3, ExternalLink, Pencil, RefreshCw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaArtwork } from "@/components/MediaArtwork";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import type { MediaItem } from "@/types/media";

type MediaListResponse = { items: MediaItem[] };
type Range = "all" | "today" | "threeDays";

function releaseTime(item: MediaItem): number | null {
  if (!item.next_episode_release_at) return null;
  const value = new Date(item.next_episode_release_at).getTime();
  return Number.isFinite(value) ? value : null;
}

function countdown(value: number, now: number): string {
  const remaining = value - now;
  if (remaining <= 0) return "Available now";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `In ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `In ${hours}h` : `In ${Math.ceil(hours / 24)}d`;
}

function dayLabel(value: number, now: number): string {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const date = new Date(value); const start = new Date(date); start.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
}

export default function QueuePage() {
  const openModal = useMediaStore((state) => state.openModal);
  const setActiveRoute = useMediaStore((state) => state.setActiveRoute);
  const mediaRev = useMediaStore((state) => state.mediaRev);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [now, setNow] = useState<number | null>(null);

  const loadRadar = async () => {
    setLoading(true); setError("");
    try {
      const [anime, donghua] = await Promise.all([
        apiRequest<MediaListResponse>("/api/media?status=Active&media_type=Anime&limit=100"),
        apiRequest<MediaListResponse>("/api/media?status=Active&media_type=Donghua&limit=100"),
      ]);
      setItems([...anime.items, ...donghua.items]
        .filter((item) => item.next_episode !== null && item.next_episode !== undefined && releaseTime(item) !== null)
        .sort((a, b) => releaseTime(a)! - releaseTime(b)!));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Release Radar could not load")); setItems([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { setActiveRoute("queue"); }, [setActiveRoute]);
  useEffect(() => { loadRadar(); }, [mediaRev]);
  useEffect(() => {
    const update = () => setNow(Date.now()); update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleItems = useMemo(() => {
    if (now === null) return [];
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    return items.filter((item) => {
      const releaseAt = releaseTime(item)!;
      if (releaseAt < now - 60 * 60_000 || (query && !item.title.toLowerCase().includes(query.toLowerCase()))) return false;
      if (range === "today") return releaseAt <= todayEnd.getTime();
      return range !== "threeDays" || releaseAt <= now + 3 * 86_400_000;
    });
  }, [items, now, query, range]);

  const releaseGroups = useMemo(() => {
    if (now === null) return [];
    const groups = new Map<string, { releaseAt: number; items: MediaItem[] }>();
    for (const item of visibleItems) {
      const releaseAt = releaseTime(item)!;
      const date = new Date(releaseAt);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const group = groups.get(key) || { releaseAt, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [visibleItems, now]);

  const next = visibleItems[0];
  const todayCount = now === null ? 0 : items.filter((item) => {
    const time = releaseTime(item); return time !== null && dayLabel(time, now) === "Today";
  }).length;

  return <main className="release-radar">
    <header className="release-radar-hero">
      <div className="release-radar-eyebrow"><Sparkles size={15} /> Release Radar</div>
      <div className="release-radar-hero-row">
        <div><h1>Your next episodes.</h1><p>Anime and Donghua, sorted by actual release time.</p></div>
        <div className="release-radar-stats"><span><strong>{todayCount}</strong> today</span><span><strong>{items.length}</strong> scheduled</span></div>
      </div>
      {next && now !== null && <div className="release-radar-next"><Clock3 size={17} /><span>Next up</span><strong>{next.title} · Episode {next.next_episode}</strong><b>{countdown(releaseTime(next)!, now)}</b></div>}
    </header>

    <div className="release-radar-controls">
      <label className="release-radar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a series" aria-label="Find a scheduled series" /></label>
      <div className="release-radar-ranges" aria-label="Release range">
        {(["all", "today", "threeDays"] as Range[]).map((value) => <button key={value} type="button" data-active={range === value} onClick={() => setRange(value)}>{value === "all" ? "All" : value === "threeDays" ? "3 days" : "Today"}</button>)}
      </div>
    </div>

    {loading || now === null ? <div className="release-radar-state"><span className="spinner" /> Building your release calendar…</div>
      : error ? <div className="release-radar-state release-radar-error"><RefreshCw size={22} /><p>{error}</p><button className="btn-primary" onClick={loadRadar}>Try again</button></div>
      : visibleItems.length === 0 ? <div className="release-radar-state"><CalendarDays size={27} /><h2>No upcoming episodes here.</h2><p>Add an Anime Countdown URL to an active Anime or Donghua entry, then test its schedule.</p></div>
      : <section className="release-radar-list" aria-label="Upcoming episodes">
        {releaseGroups.map((group) => <section key={group.releaseAt} className="release-radar-day">
          <header><time dateTime={new Date(group.releaseAt).toISOString()}><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(group.releaseAt))}</span><strong>{new Date(group.releaseAt).getDate()}</strong></time><div><b>{dayLabel(group.releaseAt, now)}</b><small>{group.items.length} episode{group.items.length === 1 ? "" : "s"}</small></div></header>
          <div className="release-radar-day-items">{group.items.map((item) => {
            const releaseAt = releaseTime(item)!;
            const watchUrl = item.tracker_url ? normalizePublicHttpUrl(item.tracker_url) : null;
            return <article key={item._id} className="release-radar-item">
              <MediaArtwork media={item} className="release-radar-art" />
              <div className="release-radar-copy"><span>{item.media_type}</span><h2>{item.title}</h2><p>Episode {item.next_episode} · {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(releaseAt))}</p></div>
              <div className="release-radar-when"><strong>{countdown(releaseAt, now)}</strong><small>{new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(releaseAt))}</small></div>
              <div className="release-radar-actions"><button type="button" onClick={() => openModal(item)} aria-label={`Edit ${item.title}`}><Pencil size={16} /></button>{watchUrl && <a href={watchUrl} target="_blank" rel="noreferrer" aria-label={`Watch ${item.title}`}><ExternalLink size={16} /></a>}</div>
            </article>;
          })}</div>
        </section>)}
      </section>}
  </main>;
}
