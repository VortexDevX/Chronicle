import { NextRequest } from "next/server";
import { novelApi } from "@/lib/novels/api";
import Novel from "@/lib/novels/models/Novel";
import Chapter from "@/lib/novels/models/Chapter";
import { MediaItem } from "@/lib/models";
import { NovelUploadError } from "@/lib/novels/upload";
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return novelApi(req, async userId => {
    const { slug } = await ctx.params;
    const novel = await Novel.findOne({ slug, uploadState: "ready" }).select("slug title author description genres status totalChapters coverObjectKey").lean();
    if (!novel) throw new NovelUploadError("Novel not found", 404);
    const [chapters, library] = await Promise.all([
      Chapter.find({ novelSlug: slug, verified: true }).select("number title -_id").sort({ number: 1 }).lean(),
      MediaItem.findOne({ user_id: userId, hosted_novel_slug: slug }).lean(),
    ]);
    const { coverObjectKey, ...data } = novel;
    return { ...data, cover: coverObjectKey ? `/api/novels/${slug}/cover` : null, chapters, library };
  });
}
