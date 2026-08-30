"use client";

import { CalendarDays, Check, ChevronRight, Clock3, ExternalLink, Pencil, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaArtwork } from "@/components/MediaArtwork";
import { useMediaStore } from "@/store/mediaStore";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import type { MediaItem } from "@/types/media";

type RadarItem = MediaItem & {
  next_episode: number;
  next_episode_release_at: string;
  previous_episode: number | null;
  previous_episode_release_at: string | null;
  episode_title: string | null;
  finale_type: 1 | 2 | 3 | null;
  episode_url: string | null;
};

type ReleaseRadarResponse = {
  items: RadarItem[];
  tracked: number;
  unmatched: number;
  needs_matching: Array<{ _id: string; title: string; media_type: string }>;
  saved_matches: Array<{ _id: string; title: string; media_type: string }>;
  refreshed_at: string | null;
};
type MatchCandidate = { simklId: number; title: string; subtitle: string | null };
type Range = "all" | "today" | "threeDays";

function releaseTime(item: RadarItem): number | null {
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
  const [items, setItems] = useState<RadarItem[]>([]);
  const [tracked, setTracked] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [needsMatching, setNeedsMatching] = useState<ReleaseRadarResponse["needs_matching"]>([]);
  const [savedMatches, setSavedMatches] = useState<ReleaseRadarResponse["saved_matches"]>([]);
  const [matchingItem, setMatchingItem] = useState<ReleaseRadarResponse["needs_matching"][number] | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchOptions, setMatchOptions] = useState<MatchCandidate[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchSaving, setMatchSaving] = useState<number | null>(null);
  const [matchError, setMatchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [now, setNow] = useState<number | null>(null);

  const loadRadar = async () => {
    setLoading(true); setError("");
    try {
      const radar = await apiRequest<ReleaseRadarResponse>("/api/release-radar");
      setItems(radar.items.filter((item) => releaseTime(item) !== null));
      setTracked(radar.tracked);
      setUnmatched(radar.unmatched);
      setNeedsMatching(radar.needs_matching);
      setSavedMatches(radar.saved_matches);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Release Radar could not load")); setItems([]); setTracked(0); setUnmatched(0); setNeedsMatching([]); setSavedMatches([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { setActiveRoute("queue"); }, [setActiveRoute]);
  useEffect(() => { loadRadar(); }, [mediaRev]);
  useEffect(() => {
    const update = () => setNow(Date.now()); update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const searchMatches = async (value: string) => {
    const search = value.trim();
    if (search.length < 2) { setMatchOptions([]); return; }
    setMatchLoading(true); setMatchError("");
    try {
      const response = await apiRequest<{ items: MatchCandidate[] }>(`/api/release-radar/search?q=${encodeURIComponent(search)}`);
      setMatchOptions(response.items);
    } catch (matchSearchError) {
      setMatchError(getErrorMessage(matchSearchError, "Could not find titles")); setMatchOptions([]);
    } finally { setMatchLoading(false); }
  };

  const openMatcher = (item: ReleaseRadarResponse["needs_matching"][number]) => {
    setMatchingItem(item); setMatchQuery(item.title); setMatchOptions([]); setMatchError("");
    void searchMatches(item.title);
  };

  const saveMatch = async (candidate: MatchCandidate) => {
    if (!matchingItem) return;
    setMatchSaving(candidate.simklId); setMatchError("");
    try {
      await apiRequest("/api/release-radar/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: matchingItem._id, simkl_id: candidate.simklId }) });
      setNeedsMatching((current) => current.filter((item) => item._id !== matchingItem._id));
      setMatchingItem(null); await loadRadar();
    } catch (matchSaveError) {
      setMatchError(getErrorMessage(matchSaveError, "Could not save this match"));
    } finally { setMatchSaving(null); }
  };

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
    const groups = new Map<string, { releaseAt: number; items: RadarItem[] }>();
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
        <div><h1>Your next episodes.</h1><p>Anime and Donghua, matched from your library and refreshed automatically.</p></div>
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
      : visibleItems.length === 0 ? <div className="release-radar-state"><CalendarDays size={27} /><h2>No upcoming episodes here.</h2><p>{tracked === 0 ? "Add an active Anime or Donghua to start your release calendar." : "Nothing is announced in the next few months. New dates appear automatically."}</p></div>
      : <section className="release-radar-list" aria-label="Upcoming episodes">
        {releaseGroups.map((group) => <section key={group.releaseAt} className="release-radar-day">
          <header><time dateTime={new Date(group.releaseAt).toISOString()}><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(group.releaseAt))}</span><strong>{new Date(group.releaseAt).getDate()}</strong></time><div><b>{dayLabel(group.releaseAt, now)}</b><small>{group.items.length} episode{group.items.length === 1 ? "" : "s"}</small></div></header>
          <div className="release-radar-day-items">{group.items.map((item) => {
            const releaseAt = releaseTime(item)!;
            const watchUrl = item.tracker_url ? normalizePublicHttpUrl(item.tracker_url) : null;
            return <article key={item._id} className="release-radar-item">
              <MediaArtwork media={item} className="release-radar-art" />
              <div className="release-radar-copy"><span>{item.media_type}</span><h2>{item.title}</h2><p>Episode {item.next_episode}{item.episode_title ? ` · ${item.episode_title}` : ""} · {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(releaseAt))}</p></div>
              <div className="release-radar-when"><strong>{countdown(releaseAt, now)}</strong><small>{new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(releaseAt))}</small></div>
              <div className="release-radar-actions"><button type="button" onClick={() => openModal(item)} aria-label={`Edit ${item.title}`}><Pencil size={16} /></button>{watchUrl && <a href={watchUrl} target="_blank" rel="noreferrer" aria-label={`Watch ${item.title}`}><ExternalLink size={16} /></a>}</div>
            </article>;
          })}</div>
        </section>)}
      </section>}
    {!loading && !error && tracked > 0 && unmatched > 0 && <p className="release-radar-note">{items.length} of {tracked} active shows have upcoming dates. Other titles may be between seasons or use a different name.</p>}
    {!loading && !error && needsMatching.length > 0 && <section className="release-radar-matches" aria-label="Titles needing a match">
      <div><span>Needs a quick match</span><h2>Pick the right show once.</h2><p>Some library titles use a different English name. Choose it here; Chronicle will remember.</p></div>
      <div className="release-radar-match-list">{needsMatching.map((item) => <button key={item._id} type="button" onClick={() => openMatcher(item)}><span>{item.media_type}</span><strong>{item.title}</strong><ChevronRight size={17} /></button>)}</div>
    </section>}
    {!loading && !error && savedMatches.length > 0 && <details className="release-radar-saved-matches">
      <summary>Change a saved title match <span>{savedMatches.length}</span></summary>
      <p>Wrong show? Pick a different one. Future releases will use your new choice.</p>
      <div className="release-radar-match-list">{savedMatches.map((item) => <button key={item._id} type="button" onClick={() => openMatcher(item)}><span>{item.media_type}</span><strong>{item.title}</strong><ChevronRight size={17} /></button>)}</div>
    </details>}
    {matchingItem && <div className="release-radar-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && matchSaving === null) setMatchingItem(null); }}>
      <section className="release-radar-picker" role="dialog" aria-modal="true" aria-labelledby="release-match-title">
        <button className="release-radar-picker-close" type="button" aria-label="Close title picker" disabled={matchSaving !== null} onClick={() => setMatchingItem(null)}><X size={18} /></button>
        <span>Match release calendar</span><h2 id="release-match-title">{matchingItem.title}</h2><p>Choose the same show. We will use this match for future episodes.</p>
        <label className="release-radar-match-search"><Search size={16} /><input autoFocus value={matchQuery} onChange={(event) => setMatchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchMatches(matchQuery); }} aria-label="Search for matching title" /><button type="button" onClick={() => void searchMatches(matchQuery)}>Search</button></label>
        {matchLoading ? <div className="release-radar-picker-state"><span className="spinner" /> Finding shows…</div>
          : matchError ? <div className="release-radar-picker-state">{matchError}</div>
          : <div className="release-radar-options">{matchOptions.map((candidate) => <button key={candidate.simklId} type="button" onClick={() => void saveMatch(candidate)} disabled={matchSaving !== null}><span><strong>{candidate.title}</strong>{candidate.subtitle && <small>{candidate.subtitle}</small>}</span>{matchSaving === candidate.simklId ? <span className="spinner" /> : <Check size={18} />}</button>)}{matchOptions.length === 0 && <p>Try another spelling or title.</p>}</div>}
      </section>
    </div>}
  </main>;
}
