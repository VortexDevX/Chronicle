"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { prepareNovel, uploadChapters } from "@/lib/novels/storage/upload-client";
import { parseChaptersFromText } from "@/lib/novels/chapterParser";
import { matchChaptersWithTitles, parseTitlesFile } from "@/lib/novels/titleProcessor";
import { getErrorMessage } from "@/lib/client/api";

type ChapterUpload = { file: File; title: string };
type UploadNotice = { text: string; tone: "success" | "error" | "progress" };

function applyTitleMap(chapters: ChapterUpload[], titles: Map<number, string>) {
  const matched = matchChaptersWithTitles(chapters.length, titles);
  return chapters.map((chapter, index) => ({ ...chapter, title: matched[index].title }));
}

export default function NovelUpload() {
  const titlesInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState("");
  const [status, setStatus] = useState("ongoing");
  const [cover, setCover] = useState<File | null>(null);
  const [chapters, setChapters] = useState<ChapterUpload[]>([]);
  const [titlesFile, setTitlesFile] = useState<File | null>(null);
  const [titlesMap, setTitlesMap] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [result, setResult] = useState("");

  async function filesSelected(files: FileList | null, split: boolean) {
    if (!files?.length) return;
    setNotice(null);
    try {
      const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (list.some((file) => !/\.(txt|md)$/i.test(file.name))) throw new Error("Choose TXT or Markdown files.");

      let nextChapters: ChapterUpload[];
      if (split) {
        if (list[0].size > 50 * 1024 * 1024) throw new Error("Whole-book file must be under 50 MiB.");
        const parsed = parseChaptersFromText(await list[0].text());
        if (!parsed.length) throw new Error("No chapter headings found. Use individual chapter files instead.");
        nextChapters = parsed.map((chapter, index) => ({
          file: new File([chapter.content], `chapter-${index + 1}.txt`, { type: "text/plain" }),
          title: chapter.title,
        }));
      } else {
        nextChapters = list.map((file) => ({ file, title: file.name.replace(/\.(txt|md)$/i, "") }));
      }
      setChapters(titlesFile ? applyTitleMap(nextChapters, titlesMap) : nextChapters);
    } catch (error) {
      setNotice({ text: getErrorMessage(error), tone: "error" });
    }
  }

  async function titlesSelected(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    if (file.name !== "titles.txt") {
      setNotice({ text: "File must be named exactly 'titles.txt'.", tone: "error" });
      if (titlesInputRef.current) titlesInputRef.current.value = "";
      return;
    }
    try {
      const parsed = parseTitlesFile(await file.text());
      setTitlesFile(file);
      setTitlesMap(parsed);
      setChapters((current) => applyTitleMap(current, parsed));
      setNotice({ text: `Loaded ${parsed.size} titles from titles.txt.`, tone: "success" });
    } catch (error) {
      setNotice({ text: getErrorMessage(error), tone: "error" });
    }
  }

  function removeTitlesFile() {
    setTitlesFile(null);
    setTitlesMap(new Map());
    setChapters((current) => applyTitleMap(current, new Map()));
    setNotice(null);
    if (titlesInputRef.current) titlesInputRef.current.value = "";
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setResult("");
    try {
      if (!chapters.length) throw new Error("Choose chapters first.");
      if (chapters.some((chapter) => chapter.file.size > 3 * 1024 * 1024 || chapter.file.size === 0)) throw new Error("Each chapter must contain text and be at most 3 MiB.");
      if (cover && cover.size > 3 * 1024 * 1024) throw new Error("Cover must be at most 3 MiB.");
      const prepared = await prepareNovel({
        title,
        author,
        description,
        genres: genres.split(",").map((genre) => genre.trim()).filter(Boolean),
        status,
      }, cover);
      if (!prepared.slug) throw new Error("Upload could not start.");
      await uploadChapters(
        prepared.slug,
        chapters.map((chapter) => chapter.file),
        Object.fromEntries(chapters.map((chapter, index) => [index + 1, chapter.title])),
        (done, total) => setNotice({ text: `Uploading and verifying ${done} of ${total} chapters…`, tone: "progress" }),
      );
      setNotice({ text: "Novel published.", tone: "success" });
      setResult(prepared.slug);
    } catch (error) {
      setNotice({ text: getErrorMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="novels-page">
      <div className="page-intro"><div><span className="section-eyebrow">Archive administration</span><h2>Add a story.</h2><p>Import chapter files or split a complete book. Review before publishing.</p></div></div>
      <form onSubmit={upload} className="novel-upload">
        <fieldset disabled={busy}>
          <div className="novel-form-grid">
            <label>Title<input required maxLength={250} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Author<input required maxLength={250} value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
            <label>Publication status<select value={status} onChange={(event) => setStatus(event.target.value)}>{["ongoing", "completed", "hiatus"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Genres, separated by commas<input value={genres} onChange={(event) => setGenres(event.target.value)} /></label>
          </div>
          <label>Description<textarea maxLength={20000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Cover (JPEG, PNG or WebP; 3 MiB maximum)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCover(event.target.files?.[0] || null)} /></label>
          <div className="novel-form-grid">
            <label>Individual chapters<input type="file" multiple accept=".txt,.md" onChange={(event) => void filesSelected(event.target.files, false)} /></label>
            <label>Or split a complete book<input type="file" accept=".txt,.md" onChange={(event) => void filesSelected(event.target.files, true)} /></label>
          </div>
          <div className="titles-file-upload">
            <label className="titles-file-heading" htmlFor="novel-titles-file">
              <span><FileText aria-hidden="true" />Chapter titles (optional)</span>
              <small>Use Nocturne&apos;s titles.txt format: Chapter X: Title</small>
            </label>
            <input ref={titlesInputRef} id="novel-titles-file" type="file" accept=".txt,text/plain" onChange={(event) => void titlesSelected(event.target.files?.[0])} />
            {titlesFile && (
              <div className="titles-file-loaded">
                <span><FileText aria-hidden="true" /><span><strong>{titlesFile.name}</strong><small>{titlesMap.size} titles loaded and assigned</small></span></span>
                <button type="button" onClick={removeTitlesFile} aria-label="Remove titles file"><Trash2 aria-hidden="true" /></button>
              </div>
            )}
          </div>
          {chapters.length > 0 && (
            <details open>
              <summary>{chapters.length} chapters · review titles and order</summary>
              <div className="upload-chapter-list">
                {chapters.map((chapter, index) => (
                  <label key={`${chapter.file.name}-${index}`}>Chapter {index + 1}<input required maxLength={500} value={chapter.title} onChange={(event) => setChapters((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} /></label>
                ))}
              </div>
            </details>
          )}
          <button className="novel-button" type="submit" disabled={!chapters.length}>{busy ? "Publishing…" : "Publish novel"}</button>
        </fieldset>
      </form>
      {notice && (
        <div className={`upload-status is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : notice.tone === "error" ? <AlertCircle aria-hidden="true" /> : <LoaderCircle className="spin" aria-hidden="true" />}
          <span>{notice.text}</span>
        </div>
      )}
      {result && <Link href={`/novels/${result}`}>Open published novel →</Link>}
    </section>
  );
}
