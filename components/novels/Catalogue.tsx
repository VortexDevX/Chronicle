"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Book, BookOpen, CheckCircle2, Clock3, Grid3X3, Plus, Search, Sparkles, Upload } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import type { NovelView } from "./types";

const quickFilters = [
  { id: "all", label: "All", icon: Grid3X3 },
  { id: "ongoing", label: "Ongoing", icon: Sparkles },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "recent", label: "Recent", icon: Clock3 },
] as const;

export default function Catalogue() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof quickFilters)[number]["id"]>("all");
  const [genre, setGenre] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: NovelView[]; genres: string[]; total: number; has_more: boolean; is_admin: boolean }>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState("");

  useEffect(() => setPage(1), [query, filter, genre]);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    apiRequest<typeof data>("/api/novels?all=1", { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(getErrorMessage(e)); });
    return () => controller.abort();
  }, []);

  const genres = useMemo(() => [...(data?.genres || [])].sort(), [data]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const normalizedGenre = genre.toLocaleLowerCase();
    const visible = (data?.items || []).filter((novel) => {
      if (normalizedQuery && !`${novel.title} ${novel.author}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (filter === "ongoing" || filter === "completed") if (novel.status !== filter) return false;
      if (genre !== "all" && !novel.genres.some((item) => item.toLocaleLowerCase() === normalizedGenre)) return false;
      return true;
    });
    if (filter === "recent") return visible.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return visible;
  }, [data, filter, genre, query]);
  const items = filteredItems.slice((page - 1) * 24, page * 24);
  const hasMore = page * 24 < filteredItems.length;
  const featured = items.find(novel => novel.library?.progress_current) || items[0];

  async function addToLibrary(novel: NovelView) {
    setAdding(novel.slug); setMessage("");
    try {
      const library = await apiRequest<NovelView["library"]>(`/api/novels/${novel.slug}/library`, { method: "POST" });
      setData(current => current && ({ ...current, items: current.items.map(item => item.slug === novel.slug ? { ...item, library } : item) }));
      setMessage(`${novel.title} added to your library.`);
    } catch (e) { setMessage(getErrorMessage(e)); } finally { setAdding(""); }
  }

  return <section className="novel-explore">
    <header className="novel-explore-header">
      <div><span className="novel-kicker">Discover your next chapter</span><h1>The reading room</h1><p>{data ? `${data.total} ${data.total === 1 ? "novel" : "novels"} in the collection` : "Loading novels…"}</p></div>
      <div className="novel-header-links"><Link href="/bookmarks">Saved passages</Link>{data?.is_admin && <Link className="novel-primary" href="/admin/novels/upload"><Upload size={16}/>Upload</Link>}</div>
      <label className="novel-search"><Search size={19}/><span className="sr-only">Search novels</span><input type="search" placeholder="Search by title or author…" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="novel-quick-filters" aria-label="Novel status filters">{quickFilters.map(item => <button key={item.id} className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)}><item.icon size={15}/>{item.label}</button>)}</div>
    </header>
    {featured && !query && filter === "all" && genre === "all" && <div className="novel-spotlight"><div className="novel-spotlight-copy"><span className="section-eyebrow">{featured.library?.progress_current ? "Your next chapter" : "Inside the collection"}</span><h2>{featured.title}</h2><p>{featured.description || `A story by ${featured.author}. ${featured.totalChapters.toLocaleString()} chapters to explore.`}</p><Link className="novel-primary" href={`/read/${featured.slug}/${Math.max(1,Math.min(featured.totalChapters,Math.floor(featured.library?.progress_current || 1)))}`}><BookOpen size={16}/>{featured.library?.progress_current ? `Continue chapter ${featured.library.progress_current}` : "Start reading"}</Link><Link className="novel-spotlight-details" href={`/novels/${featured.slug}`}>View book →</Link></div><div className="novel-spotlight-art">{featured.cover ? <Image src={featured.cover} alt="" fill unoptimized sizes="200px"/> : <BookOpen size={80}/>}</div></div>}
    <div className="novel-discovery-layout"><nav className="novel-genre-strip" aria-label="Novel genres"><span className="section-eyebrow">Browse genres</span><button className={genre === "all" ? "is-active" : ""} onClick={() => setGenre("all")}><Grid3X3 size={14}/>All stories</button>{genres.map(item => <button key={item} className={genre === item ? "is-active" : ""} onClick={() => setGenre(item)}>{item}</button>)}</nav>
    <div className="novel-explore-body">
      <div className="novel-section-title"><h2>All Novels</h2><span>{filteredItems.length} found</span></div>
      {error && <p className="novel-alert" role="alert">{error}</p>}{message && <p className="novel-alert" role="status">{message}</p>}
      {!data && !error && <div className="novel-loading"><i/><span>Opening archive…</span></div>}
      {data && !items.length && <div className="novel-empty"><Book size={42}/><h3>No novels found</h3><p>Try another search or clear filters.</p><button onClick={() => { setQuery(""); setGenre("all"); setFilter("all"); }}>Clear filters</button></div>}
      <div className="nocturne-novel-grid">{items.map(novel => <article className="nocturne-novel-card" key={novel.slug}>
        <div className="nocturne-cover-wrap"><Link className="nocturne-cover" href={`/novels/${novel.slug}`} aria-label={`View ${novel.title}`}>
          {novel.cover ? <Image src={novel.cover} alt={`Cover of ${novel.title}`} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1200px) 25vw, 220px"/> : <Book size={42}/>}<span className={`novel-status novel-status-${novel.status}`}>{novel.status}</span>
        </Link><div className="novel-cover-actions"><Link href={`/read/${novel.slug}/${Math.max(1, Math.min(novel.totalChapters, Math.floor(novel.library?.progress_current || 1)))}`}><BookOpen size={16}/>Read now</Link><Link href={`/novels/${novel.slug}`}>Details</Link></div><button className={`novel-add ${novel.library ? "is-added" : ""}`} disabled={!!novel.library || adding === novel.slug} onClick={() => addToLibrary(novel)} aria-label={novel.library ? `${novel.title} is in your library` : `Add ${novel.title} to library`} title={novel.library ? "In your library" : "Add to library"}>{novel.library ? <CheckCircle2 size={17}/> : adding === novel.slug ? <i className="spinner"/> : <Plus size={17}/>}</button></div>
        <h3><Link href={`/novels/${novel.slug}`}>{novel.title}</Link></h3><p>{novel.author}</p><div className="novel-card-foot"><span><BookOpen size={13}/>{novel.totalChapters.toLocaleString()} Ch</span>{novel.genres[0] && <span>{novel.genres[0]}</span>}</div>
      </article>)}</div>
      {data && filteredItems.length > 24 && <div className="novel-pagination"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </div></div>
  </section>;
}
