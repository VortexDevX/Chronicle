"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Book, BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Heart, Search, Share2 } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useMediaStore } from "@/store/mediaStore";
import type { NovelView } from "./types";

export default function NovelDetail({ slug }: { slug: string }) {
  const [novel, setNovel] = useState<NovelView>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"chapters" | "details">("chapters");
  const [page, setPage] = useState(1);
  const refresh = useMediaStore(s => s.refreshMedia);
  const load = useCallback(() => apiRequest<NovelView>(`/api/novels/${slug}`).then(setNovel), [slug]);
  useEffect(() => { void load().catch(e => setError(getErrorMessage(e))); }, [load]);
  useEffect(() => setPage(1), [search]);

  async function update(body?: object) {
    setBusy(true); setError("");
    try { await apiRequest(`/api/novels/${slug}/library`, { method: body ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }); refresh(); await load(); }
    catch(e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  }
  async function share() {
    const payload = { title: novel?.title || "Novel", text: novel ? `${novel.title} by ${novel.author}` : "Novel", url: window.location.href };
    if (navigator.share) await navigator.share(payload).catch(() => {}); else await navigator.clipboard.writeText(window.location.href);
  }

  const chapters = useMemo(() => (novel?.chapters || []).filter(c => `${c.number} ${c.title}`.toLowerCase().includes(search.toLowerCase())), [novel, search]);
  const pageSize = 25, pages = Math.max(1, Math.ceil(chapters.length / pageSize));
  const visible = chapters.slice((page - 1) * pageSize, page * pageSize);
  const current = Math.max(0, novel?.library?.progress_current || 0);
  const progress = novel ? Math.min(100, Math.round(current / Math.max(1, novel.totalChapters) * 100)) : 0;
  const readChapter = novel ? Math.min(novel.totalChapters, Math.max(1, current || 1)) : 1;

  if (!novel && !error) return <div className="novel-detail-loading"><i/><p>Loading novel…</p></div>;
  if (!novel) return <div className="novel-empty"><Book size={44}/><h2>Novel unavailable</h2><p>{error}</p><Link href="/novels">Back to novels</Link></div>;

  return <section className="nocturne-detail">
    <div className="novel-mobile-header"><Link href="/novels" aria-label="Back to novels"><ArrowLeft/></Link><button onClick={share} aria-label="Share novel"><Share2/></button></div>
    <div className="novel-detail-hero-v2">
      {novel.cover && <Image className="novel-hero-blur" src={novel.cover} alt="" fill unoptimized sizes="100vw"/>}<div className="novel-hero-wash"/>
      <div className="novel-hero-inner">
        <div className="novel-detail-cover">{novel.cover ? <Image src={novel.cover} alt={`Cover of ${novel.title}`} fill unoptimized sizes="208px"/> : <BookOpen size={58}/>}</div>
        <div className="novel-detail-copy">
          <Link className="novel-back" href="/novels"><ArrowLeft size={15}/>Explore novels</Link><h1>{novel.title}</h1><p className="novel-detail-author">by {novel.author}</p>
          <div className="novel-detail-badges"><span>{novel.status}</span>{novel.library && <span><Bookmark size={12}/>{novel.library.status}</span>}</div>
          <div className="novel-detail-genres">{novel.genres.map(item => <span key={item}>{item}</span>)}</div>
          <div className="novel-stat-grid"><div><small><BookOpen size={15}/>Chapters</small><strong>{novel.totalChapters.toLocaleString()}</strong></div><div><small>Progress</small><strong>{progress}%</strong></div><div><small>Current</small><strong>{current || "—"}</strong></div></div>
          {current > 0 && <div className="novel-progress-panel"><span><b>Reading progress</b><em>Chapter {current} of {novel.totalChapters}</em></span><i><b style={{ width: `${progress}%` }}/></i></div>}
          <div className="novel-detail-actions"><Link className="novel-primary" href={`/read/${slug}/${readChapter}`}><BookOpen size={17}/>{current ? "Continue reading" : "Start reading"}</Link>
            {!novel.library ? <button disabled={busy} onClick={() => update()}><Bookmark size={17}/>Add to library</button> : <><label><span className="sr-only">Library status</span><select disabled={busy} value={novel.library.status} onChange={e => update({ status: e.target.value })}>{["Planned", "Active", "On Hold", "Completed", "Dropped"].map(s => <option key={s}>{s}</option>)}</select></label><button className={novel.library.is_favorite ? "is-favorite" : ""} disabled={busy} onClick={() => update({ is_favorite: !novel.library?.is_favorite })} aria-label="Toggle favourite"><Heart size={18} fill={novel.library.is_favorite ? "currentColor" : "none"}/></button></>}
            <button onClick={share} aria-label="Share novel"><Share2 size={18}/></button>
          </div>{error && <p className="novel-alert" role="alert">{error}</p>}
        </div>
      </div>
    </div>
    <div className="novel-detail-body">
      <nav className="novel-detail-tabs"><button className={tab === "chapters" ? "is-active" : ""} onClick={() => setTab("chapters")}>Chapters <span>{novel.totalChapters}</span></button><button className={tab === "details" ? "is-active" : ""} onClick={() => setTab("details")}>Details</button></nav>
      {tab === "details" ? <article className="novel-description"><span className="novel-kicker">About this story</span><h2>{novel.title}</h2><p>{novel.description || "No description available."}</p></article> : <>
        <div className="chapter-toolbar"><div><h2>Chapters</h2><p>{chapters.length.toLocaleString()} available</p></div><label><Search size={17}/><span className="sr-only">Find a chapter</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chapter title or number…"/></label></div>
        <div className="nocturne-chapter-list">{visible.map(chapter => <Link className={chapter.number === current ? "is-current" : ""} key={chapter.number} prefetch={false} href={`/read/${slug}/${chapter.number}`}><span>{String(chapter.number).padStart(3,"0")}</span><div><strong>{chapter.title}</strong><small>Chapter {chapter.number}</small></div>{chapter.number <= current ? <Check size={16}/> : <ChevronRight size={16}/>}</Link>)}</div>
        <div className="chapter-pagination"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft/>Previous</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>Next<ChevronRight/></button></div>
      </>}
    </div>
  </section>;
}
