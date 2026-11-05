import { NextRequest } from "next/server";
import { z } from "zod";
import { novelApi } from "@/lib/novels/api";
import { ensureNovelLibrary } from "@/lib/novels/library";
import { MediaItem } from "@/lib/models";
type Context = { params: Promise<{ slug: string }> };
export async function POST(req: NextRequest, ctx: Context) {
  return novelApi(req, async userId => ensureNovelLibrary(userId, (await ctx.params).slug));
}
export async function PATCH(req: NextRequest, ctx: Context) {
  return novelApi(req, async userId => {
    const { slug } = await ctx.params;
    const body = z.object({ status: z.enum(["Planned", "Active", "On Hold", "Completed", "Dropped"]).optional(), is_favorite: z.boolean().optional() }).parse(await req.json());
    await ensureNovelLibrary(userId, slug);
    return MediaItem.findOneAndUpdate({ user_id: userId, hosted_novel_slug: slug }, { $set: body }, { new: true });
  });
}
