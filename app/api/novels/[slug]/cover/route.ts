import { NextRequest, NextResponse } from "next/server";
import { novelApi } from "@/lib/novels/api";
import Novel from "@/lib/novels/models/Novel";
import { getObject } from "@/lib/novels/storage/r2";
import { imageType } from "@/lib/novels/storage/verify";
import { NovelUploadError } from "@/lib/novels/upload";
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return novelApi(req, async () => {
    const { slug } = await ctx.params;
    const novel = await Novel.findOne({ slug, uploadState: "ready" }).select("coverObjectKey");
    if (!novel?.coverObjectKey) throw new NovelUploadError("Cover not found", 404);
    const body = await getObject(novel.coverObjectKey);
    return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": imageType(body) || "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
  });
}
