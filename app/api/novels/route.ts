import { NextRequest } from "next/server";
import { novelApi } from "@/lib/novels/api";
import Novel from "@/lib/novels/models/Novel";
import { MediaItem, User } from "@/lib/models";
import { escapeRegex } from "@/lib/services/media/query";
export async function GET(req: NextRequest) {
  return novelApi(req, async (userId) => {
    const search = req.nextUrl.searchParams.get("search")?.slice(0, 200) || "";
    const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1));
    const genre = req.nextUrl.searchParams.get("genre")?.slice(0,100);
    const status = req.nextUrl.searchParams.get("status");
    const filter = { uploadState: "ready", ...(genre && genre !== "all" ? { genres: new RegExp(`^${escapeRegex(genre)}$`,"i") } : {}), ...(["ongoing","completed"].includes(status || "") ? {status} : {}), ...(search ? { $or: [{ title: new RegExp(escapeRegex(search), "i") }, { author: new RegExp(escapeRegex(search), "i") }] } : {}) };
    const [novels, total, user, genres] = await Promise.all([
      Novel.find(filter).select("slug title author description genres status totalChapters coverObjectKey").sort(status === "recent" ? { createdAt: -1, _id: -1 } : { title: 1 }).skip((page - 1) * 24).limit(24).lean(),
      Novel.countDocuments(filter), User.findById(userId).select("is_admin"),
      Novel.distinct("genres", { uploadState:"ready" }),
    ]);
    const library = await MediaItem.find({ user_id: userId, hosted_novel_slug: { $in: novels.map(n => n.slug) } }).lean();
    return { items: novels.map(({ coverObjectKey, ...n }) => ({ ...n, cover: coverObjectKey ? `/api/novels/${n.slug}/cover` : null, library: library.find(m => m.hosted_novel_slug === n.slug) || null })), genres, total, has_more: page * 24 < total, is_admin: Boolean(user?.is_admin) };
  });
}
