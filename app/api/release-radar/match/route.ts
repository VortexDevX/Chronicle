import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { MediaItem } from "@/lib/models";

export async function POST(req: NextRequest) {
  await connectDB();
  const { userId, errorResponse } = await requireAuthUserId(req);
  if (!userId && errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const simklId = Number(body.simkl_id);
  if (!mongoose.Types.ObjectId.isValid(id) || !Number.isInteger(simklId) || simklId <= 0) {
    return jsonError("INVALID_MATCH", "Choose a valid title", 400);
  }

  const item = await MediaItem.findOneAndUpdate(
    { _id: id, user_id: userId, media_type: { $in: ["Anime", "Donghua"] } },
    { $set: { simkl_id: simklId } },
    { new: true },
  );
  if (!item) return jsonError("NOT_FOUND", "Entry not found", 404);
  return jsonOk({ id: String(item._id), simkl_id: simklId });
}
