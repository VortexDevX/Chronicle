import { remoteUpload } from "@/lib/novels/remote-upload";
import { jsonError } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "prepare" && action !== "presign" && action !== "complete") return jsonError("NOT_FOUND", "Unknown upload action", 404);
  return remoteUpload(req, action);
}
