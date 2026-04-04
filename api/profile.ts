import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User } from "./utils/db.js";
import { verifyToken } from "./utils/auth.js";
import { handleOptions, setCors, jsonOk, jsonError } from "./utils/http.js";
import { logInternalError } from "./utils/log.js";

const MAX_DISPLAY_NAME = 50;
const MAX_BIO = 300;
const MAX_SLUG = 30;

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]{3,30}$/.test(slug);
}

function isValidHttpUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  try {
    await connectDB();
    const userId = verifyToken(req.headers.authorization);
    if (!userId) {
      return jsonError(res, "UNAUTHORIZED", "Unauthorized", 401);
    }

    if (req.method === "GET") {
      const user = await User.findById(userId).select(
        "username display_name bio public_profile_enabled public_slug avatar_url notifications_enabled telegram_chat_id created_at",
      );
      if (!user) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }
      return jsonOk(res, {
        username: user.username,
        display_name: user.display_name || null,
        bio: user.bio || null,
        public_profile_enabled: user.public_profile_enabled || false,
        public_slug: user.public_slug || null,
        avatar_url: user.avatar_url || null,
        notifications_enabled: user.notifications_enabled || false,
        telegram_chat_id: user.telegram_chat_id ? "***configured***" : null,
        created_at: user.created_at,
      });
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      const updates: Record<string, unknown> = {};

      if (body.display_name !== undefined) {
        const dn = String(body.display_name || "").trim();
        if (dn.length > MAX_DISPLAY_NAME) {
          return jsonError(
            res,
            "INVALID_DISPLAY_NAME",
            `Display name must be at most ${MAX_DISPLAY_NAME} characters`,
            400,
          );
        }
        updates.display_name = dn || null;
      }

      if (body.bio !== undefined) {
        const bio = String(body.bio || "").trim();
        if (bio.length > MAX_BIO) {
          return jsonError(
            res,
            "INVALID_BIO",
            `Bio must be at most ${MAX_BIO} characters`,
            400,
          );
        }
        updates.bio = bio || null;
      }

      if (body.public_profile_enabled !== undefined) {
        updates.public_profile_enabled = Boolean(body.public_profile_enabled);
      }

      if (body.public_slug !== undefined) {
        if (body.public_slug === null || body.public_slug === "") {
          updates.public_slug = null;
        } else {
          const slug = String(body.public_slug).trim().toLowerCase();
          if (!isValidSlug(slug)) {
            return jsonError(
              res,
              "INVALID_SLUG",
              "Slug must be 3-30 characters: lowercase letters, numbers, hyphens, underscores",
              400,
            );
          }
          // Check uniqueness
          const existing = await User.findOne({
            public_slug: slug,
            _id: { $ne: userId },
          });
          if (existing) {
            return jsonError(res, "SLUG_TAKEN", "This slug is already taken", 409);
          }
          updates.public_slug = slug;
        }
      }

      if (body.avatar_url !== undefined) {
        if (body.avatar_url === null || body.avatar_url === "") {
          updates.avatar_url = null;
        } else {
          const url = String(body.avatar_url).trim();
          if (!isValidHttpUrl(url)) {
            return jsonError(
              res,
              "INVALID_AVATAR_URL",
              "avatar_url must be a valid http/https URL",
              400,
            );
          }
          updates.avatar_url = url.slice(0, 500);
        }
      }

      if (body.notifications_enabled !== undefined) {
        updates.notifications_enabled = Boolean(body.notifications_enabled);
      }

      if (body.telegram_chat_id !== undefined) {
        if (body.telegram_chat_id === null || body.telegram_chat_id === "") {
          updates.telegram_chat_id = null;
        } else {
          const chatId = String(body.telegram_chat_id).trim();
          if (chatId.length > 50) {
            return jsonError(
              res,
              "INVALID_CHAT_ID",
              "telegram_chat_id is too long",
              400,
            );
          }
          updates.telegram_chat_id = chatId;
        }
      }

      if (Object.keys(updates).length === 0) {
        return jsonError(res, "NO_UPDATES", "No valid fields to update", 400);
      }

      const updated = await User.findByIdAndUpdate(userId, updates, {
        new: true,
      }).select(
        "username display_name bio public_profile_enabled public_slug avatar_url notifications_enabled created_at",
      );
      if (!updated) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }

      return jsonOk(res, {
        username: updated.username,
        display_name: updated.display_name || null,
        bio: updated.bio || null,
        public_profile_enabled: updated.public_profile_enabled || false,
        public_slug: updated.public_slug || null,
        avatar_url: updated.avatar_url || null,
        notifications_enabled: updated.notifications_enabled || false,
        created_at: updated.created_at,
      });
    }

    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  } catch (err) {
    logInternalError("profile_handler_error", err, { route: "profile" });
    return jsonError(res, "PROFILE_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
