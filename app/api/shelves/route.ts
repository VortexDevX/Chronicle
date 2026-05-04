import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Shelf, MediaItem } from "@/lib/models";
import { jsonOk, jsonError } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { requireAuthUserId } from "@/lib/guards";
import mongoose from "mongoose";

const MAX_SHELF_NAME = 80;
const MAX_SHELF_DESCRIPTION = 300;

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeShelfText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

export async function GET(req: NextRequest) {
  try {
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    await connectDB();

    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      if (!isValidObjectId(id)) {
        return jsonError("INVALID_ID", "Invalid shelf ID", 400);
      }

      const shelf = await Shelf.findOne({ _id: id, user_id: userId }).lean();
      if (!shelf) return jsonError("NOT_FOUND", "Shelf not found", 404);
      const mediaIds = Array.isArray((shelf as { media_ids?: unknown[] }).media_ids)
        ? (shelf as { media_ids?: unknown[] }).media_ids
        : [];

      const media = await MediaItem.find({
        _id: { $in: mediaIds },
        user_id: userId,
      })
        .sort({ last_updated: -1 })
        .lean();

      return jsonOk({ items: media });
    }

    const shelves = await Shelf.find({ user_id: userId }).sort({ created_at: -1 }).lean();

    return jsonOk({ items: shelves });
  } catch (err) {
    logInternalError("shelves_get_error", err, { route: "shelves" });
    return jsonError("SHELVES_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const body = await req.json().catch(() => ({}));
    const name = normalizeShelfText(body.name, MAX_SHELF_NAME);
    const description = normalizeShelfText(body.description, MAX_SHELF_DESCRIPTION);

    if (!name) {
      return jsonError("INVALID_NAME", "Shelf name is required", 400);
    }

    await connectDB();

    const existing = await Shelf.findOne({ user_id: userId, name });
    if (existing) {
      return jsonError("DUPLICATE_NAME", "A shelf with this name already exists", 409);
    }

    const shelf = await Shelf.create({
      user_id: new mongoose.Types.ObjectId(userId as string),
      name,
      description,
      media_ids: [],
    });

    return jsonOk(shelf);
  } catch (err) {
    logInternalError("shelves_post_error", err, { route: "shelves" });
    return jsonError("SHELVES_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("MISSING_ID", "Shelf ID is required", 400);
    if (!isValidObjectId(id)) return jsonError("INVALID_ID", "Invalid shelf ID", 400);

    const body = await req.json().catch(() => ({}));
    const { media_ids } = body;

    await connectDB();

    const shelf = await Shelf.findOne({ _id: id, user_id: userId });
    if (!shelf) return jsonError("NOT_FOUND", "Shelf not found", 404);

    if (body.name !== undefined) {
      const name = normalizeShelfText(body.name, MAX_SHELF_NAME);
      if (!name) return jsonError("INVALID_NAME", "Shelf name is required", 400);

      const existing = await Shelf.findOne({ user_id: userId, name, _id: { $ne: id } });
      if (existing) return jsonError("DUPLICATE_NAME", "A shelf with this name already exists", 409);
      shelf.name = name;
    }

    if (body.description !== undefined) {
      shelf.description = normalizeShelfText(body.description, MAX_SHELF_DESCRIPTION);
    }

    if (Array.isArray(media_ids)) {
      const validMediaIds = media_ids.filter((m: unknown) => typeof m === "string" && isValidObjectId(m));
      shelf.media_ids = validMediaIds.map((m: string) => new mongoose.Types.ObjectId(m));
    }

    await shelf.save();

    return jsonOk(shelf);
  } catch (err) {
    logInternalError("shelves_put_error", err, { route: "shelves" });
    return jsonError("SHELVES_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("MISSING_ID", "Shelf ID is required", 400);
    if (!isValidObjectId(id)) return jsonError("INVALID_ID", "Invalid shelf ID", 400);

    await connectDB();

    const deleted = await Shelf.findOneAndDelete({ _id: id, user_id: userId });
    if (!deleted) return jsonError("NOT_FOUND", "Shelf not found", 404);

    return jsonOk({ success: true });
  } catch (err) {
    logInternalError("shelves_delete_error", err, { route: "shelves" });
    return jsonError("SHELVES_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
