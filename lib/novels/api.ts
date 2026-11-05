import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { NovelUploadError } from "./upload";

export async function novelApi(req: NextRequest, action: (userId: string) => Promise<unknown>) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId) return errorResponse!;
    const result = await action(userId);
    const response = result instanceof NextResponse ? result : jsonOk(result);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return jsonError("INVALID_INPUT", "Invalid request", 400);
    if (error instanceof NovelUploadError) return jsonError("NOVEL_ERROR", error.message, error.status);
    return jsonError("NOVEL_UNAVAILABLE", "Unable to load or save novel data. Please retry.", 500);
  }
}
