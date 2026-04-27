import type { VercelRequest, VercelResponse } from "./_utils/vercelTypes.js";
import { connectDB, User, MediaItem } from "./_utils/db.js";
import { handleOptions, setCors, jsonOk, jsonError } from "./_utils/http.js";
import { logInternalError } from "./_utils/log.js";
import mongoose from "mongoose";
import {
  isAllowedMediaStatus,
  isAllowedMediaType,
} from "./_utils/mediaValidation.js";

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]{3,30}$/.test(slug);
}

/**
 * Public profile API — read-only, no auth required.
 *
 * GET /api/public?slug=<slug>          → public profile info
 * GET /api/public?slug=<slug>&media=1  → public media list
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  if (req.method !== "GET") {
    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  try {
    await connectDB();

    const slug = String(req.query.slug || "").trim().toLowerCase();
    if (!slug) {
      return jsonError(res, "MISSING_SLUG", "Missing slug parameter", 400);
    }
    if (!isValidSlug(slug)) {
      return jsonError(res, "INVALID_SLUG", "Invalid slug parameter", 400);
    }

    const user = await User.findOne({
      public_slug: slug,
      public_profile_enabled: true,
    }).select(
      "_id username display_name bio avatar_url public_slug created_at",
    );

    if (!user) {
      return jsonError(res, "NOT_FOUND", "Profile not found or not public", 404);
    }

    const wantsMedia = String(req.query.media || "") === "1";

    if (!wantsMedia) {
      // Just profile info
      const totalItems = await MediaItem.countDocuments({ user_id: user._id });
      return jsonOk(res, {
        username: user.username,
        display_name: user.display_name || null,
        bio: user.bio || null,
        avatar_url: user.avatar_url || null,
        slug: user.public_slug,
        total_items: totalItems,
        created_at: user.created_at,
      });
    }

    // Media list — paginated, read-only
    const page = Math.max(
      1,
      parseInt(String(req.query.page || "1"), 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24),
    );
    const skip = (page - 1) * limit;

    const mediaType = String(req.query.media_type || "").trim();
    const status = String(req.query.status || "").trim();

    if (mediaType && !isAllowedMediaType(mediaType)) {
      return jsonError(res, "INVALID_MEDIA_TYPE", "Invalid media_type filter", 400);
    }
    if (status && !isAllowedMediaStatus(status)) {
      return jsonError(res, "INVALID_STATUS", "Invalid status filter", 400);
    }

    const userObjectId = new mongoose.Types.ObjectId(String(user._id));
    const match: Record<string, unknown> = { user_id: userObjectId };
    if (mediaType) match.media_type = mediaType;
    if (status) match.status = status;

    const [items, total] = await Promise.all([
      MediaItem.find(match)
        .select("title media_type status progress_current progress_total rating last_updated")
        .sort({ last_updated: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MediaItem.countDocuments(match),
    ]);

    return jsonOk(res, {
      items,
      total,
      page,
      limit,
      has_more: skip + items.length < total,
    });
  } catch (err) {
    logInternalError("public_handler_error", err, { route: "public" });
    return jsonError(res, "PUBLIC_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
