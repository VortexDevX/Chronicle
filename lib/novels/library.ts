import { MediaItem } from "@/lib/models";
import Novel from "./models/Novel";
import { NovelUploadError } from "./upload";

// Reading is a user action. Scrapers never call this service or advance progress.
export function chapterLibraryUpdate(chapter: number) {
  if (!Number.isSafeInteger(chapter) || chapter < 1) throw new NovelUploadError("Invalid chapter");
  return { $max: { progress_current: chapter }, $set: { status: "Active", last_updated: new Date() } };
}

export async function ensureNovelLibrary(userId: string, slug: string) {
  const novel = await Novel.findOne({ slug, uploadState: "ready" }).lean();
  if (!novel) throw new NovelUploadError("Novel not found", 404);
  const filter = { user_id: userId, hosted_novel_slug: slug };
  try {
    return await MediaItem.findOneAndUpdate(filter, { $setOnInsert: {
      ...filter, title: novel.title, media_type: "Light Novel", status: "Planned",
      progress_current: 0, progress_total: novel.totalChapters,
      dedupe_key: `hosted:${slug}`, external_status: novel.status,
      custom_cover_url: null,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return MediaItem.findOne(filter);
  }
}

export async function recordNovelChapter(userId: string, slug: string, chapter: number) {
  await ensureNovelLibrary(userId, slug);
  return MediaItem.findOneAndUpdate({ user_id: userId, hosted_novel_slug: slug }, chapterLibraryUpdate(chapter), { new: true });
}
