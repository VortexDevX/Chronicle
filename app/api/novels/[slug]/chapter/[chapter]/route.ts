import { NextRequest } from "next/server";
import { z } from "zod";
import { novelApi } from "@/lib/novels/api";
import Chapter from "@/lib/novels/models/Chapter";
import Novel from "@/lib/novels/models/Novel";
import { getObject } from "@/lib/novels/storage/r2";
import { recordNovelChapter } from "@/lib/novels/library";
import { NovelUploadError } from "@/lib/novels/upload";
type Context = { params: Promise<{ slug: string; chapter: string }> };
async function findChapter(ctx: Context) {
  const { slug, chapter } = await ctx.params;
  const number = z.coerce.number().int().positive().parse(chapter);
  if (!await Novel.exists({ slug, uploadState: "ready" })) throw new NovelUploadError("Novel not found", 404);
  const row = await Chapter.findOne({ novelSlug: slug, number, verified: true }).lean();
  if (!row) throw new NovelUploadError("Chapter not found", 404);
  return row;
}
export async function GET(req: NextRequest, ctx: Context) {
  return novelApi(req, async () => {
    const row = await findChapter(ctx);
    return { number: row.number, title: row.title, content: (await getObject(row.objectKey)).toString("utf8") };
  });
}
// Separate explicit POST: prefetching chapter text must never change the library.
export async function POST(req: NextRequest, ctx: Context) {
  return novelApi(req, async userId => {
    const row = await findChapter(ctx);
    return recordNovelChapter(userId, row.novelSlug, row.number);
  });
}
