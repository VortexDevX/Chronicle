import { NextRequest } from "next/server";
import { novelApi } from "@/lib/novels/api";
import Novel from "@/lib/novels/models/Novel";
import { MediaItem, User } from "@/lib/models";
import { escapeRegex } from "@/lib/services/media/query";
export async function GET(req: NextRequest) {
  return novelApi(req, async (userId) => {
    const search = req.nextUrl.searchParams.get("search")?.slice(0, 200) || "";
    const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1));
    const all = req.nextUrl.searchParams.get("all") === "1";
    const genre = req.nextUrl.searchParams.get("genre")?.slice(0,100);
    const status = req.nextUrl.searchParams.get("status");
    const filter = { uploadState: "ready", ...(!all && genre && genre !== "all" ? { genres: new RegExp(`^${escapeRegex(genre)}$`,"i") } : {}), ...(!all && ["ongoing","completed"].includes(status || "") ? {status} : {}), ...(!all && search ? { $or: [{ title: new RegExp(escapeRegex(search), "i") }, { author: new RegExp(escapeRegex(search), "i") }] } : {}) };
    const novelQuery = Novel.find(filter)
      .select("slug title author description genres status totalChapters coverObjectKey createdAt")
      .sort(!all && status === "recent" ? { createdAt: -1, _id: -1 } : { title: 1 });
    if (!all) novelQuery.skip((page - 1) * 24).limit(24);
    else novelQuery.limit(10000);
    const [novels, total, user, genres] = await Promise.all([
      novelQuery.lean(),
      Novel.countDocuments(filter), User.findById(userId).select("is_admin"),
      Novel.distinct("genres", { uploadState:"ready" }),
    ]);
    const library = await MediaItem.find({ user_id: userId, hosted_novel_slug: { $in: novels.map(n => n.slug) } }).lean();
    const libraryBySlug = new Map(library.map((item) => [item.hosted_novel_slug, item]));
    return { items: novels.map(({ coverObjectKey, ...n }) => ({ ...n, cover: coverObjectKey ? `/api/novels/${n.slug}/cover` : null, library: libraryBySlug.get(n.slug) || null })), genres, total, has_more: !all && page * 24 < total, is_admin: Boolean(user?.is_admin) };
  });
}
