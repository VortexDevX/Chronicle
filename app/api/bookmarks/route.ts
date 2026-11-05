import { NextRequest } from "next/server";
import { z } from "zod";
import { novelApi } from "@/lib/novels/api";
import { NovelBookmark } from "@/lib/novels/models/Bookmark";
import Chapter from "@/lib/novels/models/Chapter";
import Novel from "@/lib/novels/models/Novel";
import { NovelUploadError } from "@/lib/novels/upload";
const fields = { note: z.string().max(2000).optional(), tags: z.array(z.string().max(50)).max(10).optional(), color: z.enum(["sage", "yellow", "blue", "rose"]).optional() };
const id = z.string().regex(/^[a-f\d]{24}$/i);
export async function GET(req: NextRequest) {
  return novelApi(req, async userId => {
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const slug = req.nextUrl.searchParams.get("novel");
    const query = { user_id: userId, ...(slug ? { novel_slug: slug } : {}) };
    const [items, total] = await Promise.all([NovelBookmark.find(query).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(), NovelBookmark.countDocuments(query)]);
    const novels = await Novel.find({ slug: { $in: items.map(b => b.novel_slug) } }).select("slug title").lean();
    return { items: items.map(b => ({ ...b, title: novels.find(n => n.slug === b.novel_slug)?.title || b.novel_slug })), has_more: page * 50 < total };
  });
}
export async function POST(req: NextRequest) {
  return novelApi(req, async userId => {
    const body = z.object({ novel_slug: z.string().max(120), chapter: z.number().int().positive(), paragraph: z.number().int().min(0), selected_text: z.string().max(10000), ...fields }).parse(await req.json());
    if (!await Novel.exists({ slug: body.novel_slug, uploadState: "ready" }) || !await Chapter.exists({ novelSlug: body.novel_slug, number: body.chapter, verified: true })) throw new NovelUploadError("Chapter not found", 404);
    return NovelBookmark.create({ ...body, user_id: userId });
  });
}
export async function PATCH(req: NextRequest) {
  return novelApi(req, async userId => {
    const { _id, ...body } = z.object({ _id: id, ...fields }).parse(await req.json());
    const row = await NovelBookmark.findOneAndUpdate({ _id, user_id: userId }, { $set: body }, { new: true, runValidators: true });
    if (!row) throw new NovelUploadError("Bookmark not found", 404);
    return row;
  });
}
export async function DELETE(req: NextRequest) {
  return novelApi(req, async userId => {
    await NovelBookmark.deleteOne({ _id: id.parse(req.nextUrl.searchParams.get("id")), user_id: userId });
    return { deleted: true };
  });
}
