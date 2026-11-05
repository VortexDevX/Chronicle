import { NextRequest, NextResponse } from "next/server";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { User } from "@/lib/models";

export class NovelUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function generateSlug(title: string) {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export async function requireNovelUploader(request: Request) {
  // Next route handlers already receive NextRequest; reconstructing a streaming
  // POST Request can require duplex and lose its cookie wrapper.
  const req = request as NextRequest;
  const auth = await requireAuthUserId(req);
  if (!auth.userId) return { response: auth.errorResponse! };
  const user = await User.findById(auth.userId).select("is_admin");
  if (!user?.is_admin) return { response: NextResponse.json({ success: false, message: "Administrator access required" }, { status: 403 }) };
  const rate = await enforceRateLimit(req, { key: `novel-upload:${auth.userId}`, limit: 600, windowMs: 60000, route: "novel-upload", method: req.method });
  if (!rate.allowed) return { response: rate.errorResponse! };
  return { session: { userId: auth.userId } };
}
