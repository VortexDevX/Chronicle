"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
type Bookmark = { _id: string; novel_slug: string; chapter: number; paragraph: number; selected_text: string; note: string; title: string; tags: string[]; color: string };
export default function Bookmarks() {
  const [items, setItems] = useState<Bookmark[]>([]); const [page,setPage] = useState(1); const [more,setMore] = useState(false);
  const [error,setError] = useState(""); const [search,setSearch] = useState(""); const [editing,setEditing] = useState<Bookmark>();
  const load = useCallback(async () => { const data = await apiRequest<{ items: Bookmark[]; has_more: boolean }>(`/api/bookmarks?page=${page}`); setItems(data.items); setMore(data.has_more); }, [page]);
  useEffect(() => { void load().catch(e => setError(getErrorMessage(e))); }, [load]);
  async function remove(id: string) { try { await apiRequest(`/api/bookmarks?id=${id}`, { method: "DELETE" }); await load(); } catch(e) { setError(getErrorMessage(e)); } }
  async function save() { try { await apiRequest("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) }); setEditing(undefined); await load(); } catch(e) { setError(getErrorMessage(e)); } }
  return <section className="novels-page"><div className="page-intro"><div><span className="section-eyebrow">Words worth keeping</span><h2>Saved passages.</h2><p>Bookmarks, quotes, and your notes.</p></div><Link href="/novels">The archive →</Link></div>
    <label>Filter this page<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search passages, titles or notes"/></label>
    {error && <p role="alert">{error}</p>}{items.length === 0 && <div className="novel-empty"><h3>Your commonplace book</h3><p>Save a passage while reading and it will appear here.</p></div>}
    <div className="bookmark-list">{items.filter(b => `${b.title} ${b.note} ${b.selected_text} ${b.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())).map(b => <article key={b._id} data-color={b.color}><span className="section-eyebrow">{b.title} · Chapter {b.chapter}</span><blockquote>{b.selected_text || "Chapter bookmark"}</blockquote><p>{b.note}</p><p>{b.tags.join(" · ")}</p><div className="novel-toolbar"><Link href={`/read/${b.novel_slug}/${b.chapter}#p-${b.paragraph}`}>Return to passage →</Link><button onClick={() => setEditing(b)}>Edit note</button><button onClick={() => remove(b._id)}>Remove</button></div></article>)}</div>
    {editing && <div className="bookmark-editor"><label>Note<textarea maxLength={2000} value={editing.note} onChange={e => setEditing({ ...editing,note:e.target.value })}/></label><label>Tags<input value={editing.tags.join(",")} onChange={e => setEditing({ ...editing,tags:e.target.value.split(",").slice(0,10) })}/></label><label>Colour<select value={editing.color} onChange={e => setEditing({ ...editing,color:e.target.value })}>{["sage","yellow","blue","rose"].map(c => <option key={c}>{c}</option>)}</select></label><button onClick={save}>Save</button><button onClick={() => setEditing(undefined)}>Cancel</button></div>}
    <div className="novel-pagination"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button disabled={!more} onClick={() => setPage(p => p + 1)}>Next</button></div>
  </section>;
}
