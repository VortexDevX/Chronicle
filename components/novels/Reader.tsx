"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, List, Search, Settings2, ScanLine, X } from "lucide-react";
import ReaderAppearance from "./ReaderAppearance";
import {readerFonts} from "@/lib/novels/reader-settings";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { useMediaStore } from "@/store/mediaStore";
import { defaultSettings, type ReaderSettings, type NovelView } from "./types";
type Chapter = { number: number; title: string; content: string };

export default function Reader({ slug, chapterNumber }: { slug: string; chapterNumber: number }) {
  const [chapter, setChapter] = useState<Chapter>(); const [novel, setNovel] = useState<NovelView>();
  const [error, setError] = useState(""); const [saveError, setSaveError] = useState("");
  const [settings, setSettings] = useState<ReaderSettings>(defaultSettings); const [query, setQuery] = useState("");
  const [page, setPage] = useState(0); const [retry, setRetry] = useState(0); const [saved, setSaved] = useState("");
  const [panel, setPanel] = useState<"chapters" | "settings" | null>(null); const [searchOpen, setSearchOpen] = useState(false);
  const [focused,setFocused]=useState(false);
  const pointerStart=useRef({x:0,y:0,scroll:0});
  const [bookmarkText, setBookmarkText] = useState(""); const [bookmarkNote, setBookmarkNote] = useState("");
  const [bookmarkParagraph, setBookmarkParagraph] = useState(0); const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const refresh = useMediaStore(s => s.refreshMedia); const contentRef = useRef<HTMLElement>(null);

  async function record() { setSaveError(""); try { await apiRequest(`/api/novels/${slug}/chapter/${chapterNumber}`, { method: "POST" }); refresh(); } catch { setSaveError("Chapter opened, but your library could not be updated."); } }
  useEffect(() => {
    const controller = new AbortController(); setError(""); setChapter(undefined); setPage(0);
    Promise.all([apiRequest<Chapter>(`/api/novels/${slug}/chapter/${chapterNumber}`, { signal: controller.signal }), apiRequest<NovelView>(`/api/novels/${slug}`, { signal: controller.signal })]).then(([c,n]) => { if (!controller.signal.aborted) { setChapter(c); setNovel(n); } }).catch(e => { if (!controller.signal.aborted) setError(getErrorMessage(e)); });
    return () => controller.abort();
  }, [slug, chapterNumber, retry]);
  // One write per displayed chapter. No scroll listener, interval, percentage or timer.
  useEffect(() => { if (!chapter) return; let cancelled = false; apiRequest(`/api/novels/${slug}/chapter/${chapter.number}`, { method: "POST" }).then(() => { if (!cancelled) refresh(); }).catch(() => { if (!cancelled) setSaveError("Chapter opened, but your library could not be updated."); }); return () => { cancelled = true; }; }, [chapter, slug, refresh]);
  useEffect(() => { const controller = new AbortController(); apiRequest<Partial<ReaderSettings>>("/api/reader/preferences", { signal: controller.signal }).then(s => { if (!controller.signal.aborted) setSettings({ ...defaultSettings, ...s }); }).catch(() => {}); return () => controller.abort(); }, []);

  const paragraphs = chapter?.content.replace(/\r\n?/g,"\n").split(/\n\s*\n/).filter(p => p.trim()) || [];
  const pageCount = Math.max(1, Math.ceil(paragraphs.length / 8)); const words = paragraphs.join(" ").trim().split(/\s+/).filter(Boolean).length;
  useEffect(()=>{ setPage(0); },[settings.mode]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,textarea,select,button,a,[contenteditable=true]"))) return;
      if(event.key === "Escape") {setFocused(false);setPanel(null);setBookmarkOpen(false);return;}
      if(panel || bookmarkOpen || searchOpen) return;
      if(event.key.toLowerCase()==="m") setFocused(value=>!value);
      if(event.key.toLowerCase()==="s") {setFocused(false);setPanel("settings");}
      if(["ArrowRight","ArrowLeft","PageDown","PageUp"].includes(event.key)) {
        event.preventDefault(); const direction=["ArrowRight","PageDown"].includes(event.key)?1:-1;
        if(settings.mode==="paged") setPage(value=>Math.max(0,Math.min(pageCount-1,value+direction)));
        else {const viewport=document.querySelector(".reader-viewport");viewport?.scrollBy({top:direction*viewport.clientHeight*.85,behavior:"auto"});}
      }
    };
    window.addEventListener("keydown",key); return()=>window.removeEventListener("keydown",key);
  },[panel,bookmarkOpen,searchOpen,settings.mode,pageCount]);
  useEffect(() => { if (!chapter) return; const match = window.location.hash.match(/^#p-(\d+)$/); if (match) { const target = Number(match[1]); setPage(Math.floor(target / 8)); requestAnimationFrame(() => document.getElementById(`p-${target}`)?.scrollIntoView()); } }, [chapter]);
  async function saveSettings() { try { await apiRequest("/api/reader/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }); setSaved("Reading settings saved."); setPanel(null); } catch(e) { setSaved(getErrorMessage(e)); } }
  async function bookmark() { try { await apiRequest("/api/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ novel_slug: slug, chapter: chapterNumber, paragraph: bookmarkParagraph, selected_text: bookmarkText, note: bookmarkNote }) }); setBookmarkOpen(false); setSaved("Passage saved."); } catch(e) { setSaved(getErrorMessage(e)); } }
  const chapters = novel?.chapters || []; const index = chapters.findIndex(c => c.number === chapterNumber); const previous = index > 0 ? chapters[index - 1] : null; const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
  function highlighted(value: string) { if (!query) return value; const lower = value.toLowerCase(), needle = query.toLowerCase(), chunks: React.ReactNode[] = []; let start = 0, at = lower.indexOf(needle); while (at !== -1) { chunks.push(value.slice(start,at), <mark key={at}>{value.slice(at,at + needle.length)}</mark>); start = at + needle.length; at = lower.indexOf(needle,start); } chunks.push(value.slice(start)); return chunks; }
  function openBookmark() { const selection = window.getSelection(); setBookmarkText(selection?.toString().slice(0,10000) || ""); const node = selection?.anchorNode?.parentElement?.closest("[data-paragraph]"); setBookmarkParagraph(node && contentRef.current?.contains(node) ? Number(node.getAttribute("data-paragraph")) : 0); setBookmarkNote(""); setBookmarkOpen(true); }
  function move(direction: -1 | 1) { if (settings.mode === "paged" && !query) { const target = page + direction; if (target >= 0 && target < pageCount) return setPage(target); } const target = direction < 0 ? previous : next; if (target) window.location.href = `/read/${slug}/${target.number}`; }

  return <section className={`novel-reader reader-shell ${focused ? "is-focused" : ""}`} data-tint={settings.theme === "amoled" ? "default" : settings.tint} onPointerDown={event=>{pointerStart.current={x:event.clientX,y:event.clientY,scroll:document.querySelector(".reader-viewport")?.scrollTop||0};}} onClick={event=>{if(!(event.target instanceof Element) || !event.target.closest(".reader-viewport") || event.target.closest("a,button,input,select,textarea") || window.getSelection()?.toString().trim() || event.detail>1) return; const start=pointerStart.current; if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>8 || Math.abs((document.querySelector(".reader-viewport")?.scrollTop||0)-start.scroll)>8)return;setFocused(value=>!value);}} data-theme={settings.theme} style={{ "--reader-size": `${settings.fontSize}px`, "--reader-line": settings.lineHeight, "--reader-font": readerFonts.find(font=>font.value===settings.fontFamily)?.family, "--reader-width": `${settings.contentWidth}px`, "--reader-paragraph-gap": `${settings.paragraphSpacing}em`, "--reader-align": settings.textAlign } as React.CSSProperties}>
    <header className="reader-toolbar"><div className="reader-toolbar-start"><Link className="reader-back" href={`/novels/${slug}`} aria-label="Back to novel"><ArrowLeft/><span>Back</span></Link><button className="reader-tool" onClick={() => setSearchOpen(value => !value)} aria-label="Search chapter text"><Search/></button></div><div className="reader-book-title"><Link href={`/novels/${slug}`}>{novel?.title || "Novel"}</Link></div><nav className="reader-tools" aria-label="Reader tools"><button className="reader-tool" onClick={()=>setFocused(true)} aria-label="Enter focus mode"><ScanLine/></button><button className="reader-tool" onClick={() => setPanel(panel === "chapters" ? null : "chapters")} aria-label="Open chapters"><List/></button><button className="reader-tool" onClick={openBookmark} aria-label="Save selected passage / bookmark"><Bookmark/></button><button className="reader-tool" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Reading settings"><Settings2/></button></nav></header>
    {searchOpen && <div className="chapter-search"><Search/><input autoFocus aria-label="Search chapter" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find words in this chapter"/><span>{query ? `${paragraphs.filter(p => p.toLowerCase().includes(query.toLowerCase())).length} passages` : ""}</span><button onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="Close search"><X/></button></div>}
    {error && <div className="reader-notice" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}{saveError && <div className="reader-notice" role="alert">{saveError}<button onClick={record}>Retry library update</button></div>}<p className="reader-status" role="status">{saved}</p>
    {!chapter && !error && <div className="reader-loading"><i/><span>Opening chapter…</span></div>}
    {focused && <button className="reader-focus-exit" onClick={()=>setFocused(false)} aria-label="Exit focus mode"><ScanLine size={16}/><span>Exit focus</span></button>}
    {chapter && <><div className="reader-workspace"><aside className="reader-margin" aria-label="Book information"><Image src="/brand/chronicle-mark.png" alt="" width={36} height={36}/><span className="reader-imprint">Chronicle</span><div className="reader-margin-rule"/><p className="reader-eyebrow">YOUR PLACE</p><p className="reader-chapter-number">{String(chapter.number).padStart(2,"0")}</p><p>of {novel?.totalChapters.toLocaleString()} chapters</p><p className="reader-margin-author">{novel?.author}</p></aside>
      <main className="reader-stage"><div className={`reader-viewport ${settings.mode === "paged" ? "reader-paged" : ""}`}><article className="reader-article reader-content" style={{ filter: `brightness(${settings.brightness}%)` }} ref={contentRef}><header className="reader-chapter-heading"><span className="reader-eyebrow">CHAPTER {String(chapter.number).padStart(2,"0")}</span><h1>{chapter.title}</h1><div className="reader-chapter-meta"><span>{Math.max(1,Math.ceil(words/230))} min read</span><span>{words.toLocaleString()} words</span></div><div className="reader-heading-rule"/></header>{paragraphs.map((paragraph,i) => (settings.mode === "scroll" || query || Math.floor(i / 8) === page) && <p className="reader-paragraph" id={`p-${i}`} key={i} data-paragraph={i}>{highlighted(paragraph)}</p>)}<div className="reader-chapter-end"><BookOpen/><span className="reader-eyebrow">CHAPTER COMPLETE</span><p>{next?.title || "You’ve reached the last available chapter."}</p>{next ? <Link className="reader-action" href={`/read/${slug}/${next.number}`}>Continue to chapter {next.number}<ChevronRight/></Link> : <Link className="reader-action" href={`/novels/${slug}`}>Back to novel<Check/></Link>}</div></article></div></main></div>
      <footer className="reader-footer"><button className="reader-step" onClick={() => move(-1)} disabled={settings.mode === "paged" ? page === 0 && !previous : !previous} aria-label={settings.mode === "paged" ? "Previous page" : "Previous chapter"}><ChevronLeft/></button><span className="reader-location-label"><span>{chapter.title}</span><small>{settings.mode === "paged" ? `Page ${page + 1} of ${pageCount}` : `Chapter ${chapter.number} of ${novel?.totalChapters}`}</small></span><button className="reader-step" onClick={() => move(1)} disabled={settings.mode === "paged" ? page >= pageCount - 1 && !next : !next} aria-label={settings.mode === "paged" ? "Next page" : "Next chapter"}><ChevronRight/></button></footer></>}
    {panel && <><button className="reader-drawer-scrim" onClick={() => setPanel(null)} aria-label="Dismiss panel"/><aside className="reader-drawer" aria-label={panel === "settings" ? "Reading settings" : "Chapter list"}><header><div><span className="reader-eyebrow">READER</span><h2>{panel === "settings" ? "Reading settings" : "Chapters"}</h2></div><button onClick={() => setPanel(null)} aria-label="Close panel"><X/></button></header>{panel === "chapters" ? <div className="reader-chapter-drawer"><label><Search/><input type="search" placeholder="Find chapter" value={query} onChange={e => setQuery(e.target.value)}/></label>{chapters.filter(c => `${c.number} ${c.title}`.toLowerCase().includes(query.toLowerCase())).map(c => <Link className={c.number === chapterNumber ? "is-current" : ""} key={c.number} href={`/read/${slug}/${c.number}`}><span>{String(c.number).padStart(3,"0")}</span>{c.title}</Link>)}</div> : <ReaderAppearance settings={settings} onChange={setSettings} onSave={saveSettings} onFocus={()=>{setPanel(null);setFocused(true);}}/>}</aside></>}
    {bookmarkOpen && <div className="reader-modal" role="dialog" aria-modal="true" aria-label="Save bookmark"><div className="bookmark-editor"><header><h2>Save passage</h2><button onClick={() => setBookmarkOpen(false)} aria-label="Close bookmark"><X/></button></header><label>Passage<textarea value={bookmarkText} maxLength={10000} onChange={e => setBookmarkText(e.target.value)}/></label><label>Note<textarea value={bookmarkNote} maxLength={2000} onChange={e => setBookmarkNote(e.target.value)}/></label><div><button className="reader-action" onClick={bookmark}>Save bookmark</button><button onClick={() => setBookmarkOpen(false)}>Cancel</button></div></div></div>}
  </section>;
}
