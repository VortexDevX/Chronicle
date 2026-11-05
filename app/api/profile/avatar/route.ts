import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { novelApi } from "@/lib/novels/api";
import { User } from "@/lib/models";
import { AvatarUpload } from "@/lib/novels/models/AvatarUpload";
import { createUploadUrl, getObject } from "@/lib/novels/storage/r2";
import { imageType, verifyObject } from "@/lib/novels/storage/verify";
import { NovelUploadError } from "@/lib/novels/upload";
import { enforceRateLimit } from "@/lib/guards";
export async function GET(req: NextRequest) {
  return novelApi(req, async userId => {
    const user = await User.findById(userId).select("avatar_object_key");
    if (!user?.avatar_object_key) throw new NovelUploadError("Avatar not found", 404);
    const body = await getObject(user.avatar_object_key);
    return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": imageType(body) || "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
  });
}
export async function POST(req: NextRequest) {
  return novelApi(req, async userId => {
    const rate = await enforceRateLimit(req, { key: `avatar:${userId}`, limit: 20, windowMs: 3600000, route: "avatar", method: "POST" });
    if (!rate.allowed) return rate.errorResponse!;
    const data = z.object({ extension: z.enum(["jpg", "jpeg", "png", "webp"]), size: z.number().int().positive().max(3 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await req.json());
    const key = `chronicle/avatars/${userId}/${randomUUID()}.${data.extension}`;
    const type = ["jpg", "jpeg"].includes(data.extension) ? "image/jpeg" : `image/${data.extension}`;
    const upload = await AvatarUpload.create({ user_id: userId, key, bytes: data.size, sha256: data.sha256, contentType: type, expiresAt: new Date(Date.now() + 3600000) });
    return { id: upload._id, url: await createUploadUrl(key, type), type };
  });
}
export async function PUT(req: NextRequest) {
  return novelApi(req, async userId => {
    const { id } = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).parse(await req.json());
    const upload = await AvatarUpload.findOne({ _id: id, user_id: userId, expiresAt: { $gt: new Date() } });
    if (!upload) throw new NovelUploadError("Upload expired; choose the image again", 404);
    await verifyObject(upload.key, upload.bytes, upload.sha256, upload.contentType);
    await User.updateOne({ _id: userId }, { $set: { avatar_object_key: upload.key } });
    return { avatar_url: `/api/profile/avatar?v=${id}` };
  });
}
export async function DELETE(req: NextRequest) {
  return novelApi(req, async userId => { await User.updateOne({ _id: userId }, { $set: { avatar_object_key: null } }); return { avatar_url: null }; });
}
