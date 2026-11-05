import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import NovelModel from "./models/Novel";
import ChapterModel from "./models/Chapter";
import { ensureNovelLibrary } from "./library";
import { requireNovelUploader, NovelUploadError } from "./upload";
import { generateSlug } from "./upload";

import { chapterKey, coverKey } from "./storage/keys";
import { createUploadUrl } from "./storage/r2";
import { hash, verifyObject } from "./storage/verify";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const slugInput = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(120);
const image = z.object({ extension: z.enum(["jpg", "jpeg", "png", "webp"]), size: z.number().int().positive().max(3 * 1024 * 1024), sha256: digest });
const chapterInput = z.object({ number: z.number().int().min(1).max(10000), title: z.string().trim().min(1).max(500), size: z.number().int().positive().max(3 * 1024 * 1024), sha256: digest });
const mime = (extension: string) => extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;

async function ensureLibrary(userId: string, slug: string) { await ensureNovelLibrary(userId, slug); }

export async function remoteUpload(request: Request, action: "prepare" | "presign" | "complete") {
  let incompleteId: string | undefined;
  try {
    const access = await requireNovelUploader(request);
    if (access.response) return access.response;

    if (Number(request.headers.get("content-length") || 0) > 256000) throw new NovelUploadError("Upload manifest too large", 413);
    const input = await request.json();
    const userId = access.session.userId;
    if (action === "prepare") {
      const details = z.object({ title: z.string().trim().min(1).max(250), author: z.string().trim().min(1).max(250), description: z.string().max(20000).default(""), genres: z.array(z.string().max(100)).max(30), status: z.enum(["ongoing", "completed", "hiatus"]), cover: image.optional() }).parse(input);
      const slug = generateSlug(details.title).slice(0,100) || `novel_${randomUUID()}`;
      const fingerprint = hash(Buffer.from(JSON.stringify(details)));
      const previous = await NovelModel.findOne({ slug });
      if (previous) {
        if (previous.addedBy === userId && previous.storageBackend === "r2" && previous.uploadId === fingerprint)
          return NextResponse.json({ success: true, data: { backend: "r2", slug, ready: previous.uploadState === "ready" } });
        throw new NovelUploadError("A novel with this title already exists", 409);
      }

      const coverObjectKey = details.cover ? coverKey(slug, details.cover.extension) : undefined;
      // The unique slug index reserves this import without touching ready books.
      await NovelModel.init();
      await NovelModel.create({ ...details, slug, addedBy: userId, storageBackend: "r2", uploadState: "draft", uploadId: fingerprint, totalChapters: 0,
        coverObjectKey, coverBytes: details.cover?.size, coverSha256: details.cover?.sha256,
        coverImage: coverObjectKey ? `/api/novels/cover/${slug}/${coverObjectKey.split("/").pop()}` : "" });
      return NextResponse.json({ success: true, data: { backend: "r2", slug } }, { status: 201 });
    }
    const slug = slugInput.parse(input.slug);
    const novel = await NovelModel.findOne({ slug, addedBy: userId, storageBackend: "r2" });
    if (!novel) throw new NovelUploadError("Upload not found", 404);
    if (novel.uploadState === "ready") {
      if (action === "complete" && input.finalize && input.totalChapters === novel.totalChapters) { await ensureLibrary(userId, slug); return NextResponse.json({ success: true, data: { slug, ready: true } }); }
      throw new NovelUploadError("This upload is already complete", 409);
    }
    if (action === "presign") {
      if (input.cover === true) {
        if (!novel.coverObjectKey) throw new NovelUploadError("No cover reserved");
        const type = mime(novel.coverObjectKey.split(".").pop()!);
        return NextResponse.json({ success: true, data: { url: await createUploadUrl(novel.coverObjectKey, type), type } }, { headers: { "Cache-Control": "no-store" } });
      }
      const expected = z.number().int().min(1).max(10000).parse(input.totalChapters);
      const reserved = await NovelModel.updateOne({ _id: novel._id, uploadState: { $ne: "ready" }, $or: [{ expectedChapters: { $exists: false } }, { expectedChapters: expected }] }, { $set: { expectedChapters: expected } });
      if (!reserved.matchedCount) throw new NovelUploadError("Chapter count changed during upload", 409);
      const chapters = z.array(chapterInput).min(1).max(32).parse(input.chapters);
      if (chapters.some((chapter) => chapter.number > expected)) throw new NovelUploadError("Chapter exceeds reserved count");
      if (new Set(chapters.map((c) => c.number)).size !== chapters.length) throw new NovelUploadError("Duplicate chapter numbers");
      await ChapterModel.init();
      const urls = [];
      for (const chapter of chapters) {
        const key = chapterKey(slug, chapter.number);
        const saved = await ChapterModel.findOneAndUpdate({ novelSlug: slug, number: chapter.number },
          { $setOnInsert: { novelSlug: slug, number: chapter.number, title: chapter.title, objectKey: key, bytes: chapter.size, sha256: chapter.sha256, verified: false } }, { upsert: true, new: true, runValidators: true });
        if (saved.sha256 !== chapter.sha256 || saved.bytes !== chapter.size || saved.title !== chapter.title) throw new NovelUploadError("Retry must use the same chapter files and titles", 409);
        urls.push({ number: chapter.number, url: await createUploadUrl(key, "text/plain; charset=utf-8") });
      }
      await NovelModel.updateOne({ _id: novel._id, uploadState: { $ne: "ready" } }, { $set: { uploadState: "uploading" } });
      return NextResponse.json({ success: true, data: urls }, { headers: { "Cache-Control": "no-store" } });
    }
    incompleteId = String(novel._id);
    const total = z.number().int().min(1).max(10000).parse(input.totalChapters);
    if (novel.expectedChapters !== total) throw new NovelUploadError("Chapter count differs from manifest", 409);
    if (!input.finalize) {
      const start = z.number().int().min(1).parse(input.start);
      const count = z.number().int().min(1).max(8).parse(input.count);
      if (start + count - 1 > total) throw new NovelUploadError("Invalid verification range");
      const chapters = await ChapterModel.find({ novelSlug: slug, number: { $gte: start, $lt: start + count } }).sort({ number: 1 });
      if (chapters.length !== count) throw new NovelUploadError("Chapter manifest is incomplete", 409);
      for (const chapter of chapters) {
        if (!chapter.verified) {
          const body = await verifyObject(chapter.objectKey, chapter.bytes, chapter.sha256, "text/plain; charset=utf-8");
          const content = new TextDecoder("utf-8", { fatal: true }).decode(body);
          if (!content.trim()) throw new NovelUploadError("Chapter is empty");
          await ChapterModel.updateOne({ _id: chapter._id }, { $set: { verified: true, wordCount: content.trim().split(/\s+/).length } });
        }
      }
      return NextResponse.json({ success: true, data: { verified: count } });
    }
    const [all, verified] = await Promise.all([ChapterModel.countDocuments({ novelSlug: slug }), ChapterModel.countDocuments({ novelSlug: slug, verified: true, number: { $gte: 1, $lte: total } })]);
    if (all !== total || verified !== total) throw new NovelUploadError("Verify every chapter before finishing", 409);
    if (novel.coverObjectKey) await verifyObject(novel.coverObjectKey, novel.coverBytes!, novel.coverSha256!, mime(novel.coverObjectKey.split(".").pop()!));
    await NovelModel.updateOne({ _id: novel._id, uploadState: { $ne: "ready" } }, { $set: { uploadState: "ready", totalChapters: total } });
    await ensureLibrary(userId, slug);
    return NextResponse.json({ success: true, data: { slug, ready: true } });
  } catch (error) {
    if (incompleteId && !(error instanceof NovelUploadError) && !(error instanceof z.ZodError)) await NovelModel.updateOne({ _id: incompleteId, uploadState: { $ne: "ready" } }, { $set: { uploadState: "failed" } }).catch(() => {});
    const status = error instanceof NovelUploadError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : (error as { code?: number }).code === 11000 ? 409 : 500;
    return NextResponse.json({ success: false, message: error instanceof NovelUploadError ? error.message : status === 400 ? "Invalid upload details" : status === 409 ? "A novel with this title already exists" : "Upload could not be verified. Check storage and retry." }, { status });
  }
}
