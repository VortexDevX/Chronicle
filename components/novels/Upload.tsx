"use client";
import { useState } from "react";
import Link from "next/link";
import { prepareNovel, uploadChapters } from "@/lib/novels/storage/upload-client";
import { parseChaptersFromText } from "@/lib/novels/chapterParser";
import { getErrorMessage } from "@/lib/client/api";
export default function NovelUpload() {
  const [title, setTitle] = useState(""); const [author, setAuthor] = useState("");
  const [description, setDescription] = useState(""); const [genres, setGenres] = useState("");
  const [status, setStatus] = useState("ongoing"); const [cover, setCover] = useState<File | null>(null);
  const [chapters, setChapters] = useState<{ file: File; title: string }[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [result, setResult] = useState("");
  async function filesSelected(files: FileList | null, split: boolean) {
    if (!files?.length) return;
    setMessage("");
    try {
      const list = Array.from(files).sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (list.some(f => !/\.(txt|md)$/i.test(f.name))) throw new Error("Choose TXT or Markdown files.");
      if (split) {
        if (list[0].size > 50 * 1024 * 1024) throw new Error("Whole-book file must be under 50 MiB.");
        const parsed = parseChaptersFromText(await list[0].text());
        if (!parsed.length) throw new Error("No chapter headings found. Use individual chapter files instead.");
        setChapters(parsed.map((c,i) => ({ file: new File([c.content], `chapter-${i + 1}.txt`, { type: "text/plain" }), title: c.title })));
      } else setChapters(list.map(f => ({ file: f, title: f.name.replace(/\.(txt|md)$/i, "") })));
    } catch(e) { setMessage(getErrorMessage(e)); }
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(""); setResult("");
    try {
      if (!chapters.length) throw new Error("Choose chapters first.");
      if (chapters.some(c => c.file.size > 3 * 1024 * 1024 || c.file.size === 0)) throw new Error("Each chapter must contain text and be at most 3 MiB.");
      if (cover && cover.size > 3 * 1024 * 1024) throw new Error("Cover must be at most 3 MiB.");
      const prepared = await prepareNovel({ title, author, description, genres: genres.split(",").map(s => s.trim()).filter(Boolean), status }, cover);
      if (!prepared.slug) throw new Error("Upload could not start.");
      await uploadChapters(prepared.slug, chapters.map(c => c.file), Object.fromEntries(chapters.map((c,i) => [i + 1,c.title])), (done,total) => setMessage(`Uploading and verifying ${done} of ${total} chapters…`));
      setMessage("Novel published."); setResult(prepared.slug);
    } catch(e) { setMessage(getErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="novels-page"><div className="page-intro"><div><span className="section-eyebrow">Archive administration</span><h2>Add a story.</h2><p>Import chapter files or split a complete book. Review before publishing.</p></div></div>
    <form onSubmit={upload} className="novel-upload"><fieldset disabled={busy}>
      <div className="novel-form-grid"><label>Title<input required maxLength={250} value={title} onChange={e => setTitle(e.target.value)}/></label><label>Author<input required maxLength={250} value={author} onChange={e => setAuthor(e.target.value)}/></label><label>Publication status<select value={status} onChange={e => setStatus(e.target.value)}>{["ongoing","completed","hiatus"].map(s => <option key={s}>{s}</option>)}</select></label><label>Genres, separated by commas<input value={genres} onChange={e => setGenres(e.target.value)}/></label></div>
      <label>Description<textarea maxLength={20000} value={description} onChange={e => setDescription(e.target.value)}/></label><label>Cover (JPEG, PNG or WebP; 3 MiB maximum)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setCover(e.target.files?.[0] || null)}/></label>
      <div className="novel-form-grid"><label>Individual chapters<input type="file" multiple accept=".txt,.md" onChange={e => filesSelected(e.target.files,false)}/></label><label>Or split a complete book<input type="file" accept=".txt,.md" onChange={e => filesSelected(e.target.files,true)}/></label></div>
      {chapters.length > 0 && <details open><summary>{chapters.length} chapters · review titles and order</summary><div className="upload-chapter-list">{chapters.map((c,i) => <label key={i}>Chapter {i + 1}<input required maxLength={500} value={c.title} onChange={e => setChapters(rows => rows.map((r,j) => j === i ? { ...r,title: e.target.value } : r))}/></label>)}</div></details>}
      <button className="novel-button" type="submit" disabled={!chapters.length}>{busy ? "Publishing…" : "Publish novel"}</button>
    </fieldset></form><p role="status">{message}</p>{result && <Link href={`/novels/${result}`}>Open published novel →</Link>}
  </section>;
}
