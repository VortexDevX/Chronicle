import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { jsonOk, jsonError } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { requireAuthUserId } from "@/lib/guards";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const user = await User.findById(userId).select(
      "username notifications_enabled telegram_chat_id created_at",
    );

    if (!user) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }

    return jsonOk({
      username: user.username,
      notifications_enabled: user.notifications_enabled || false,
      telegram_chat_id: user.telegram_chat_id || null,
      created_at: user.created_at,
    });
  } catch (err) {
    logInternalError("profile_handler_error", err, { route: "profile" });
    return jsonError("PROFILE_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { userId, errorResponse } = requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

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
            "INVALID_CHAT_ID",
            "telegram_chat_id is too long",
            400,
          );
        }
        updates.telegram_chat_id = chatId;
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("NO_UPDATES", "No valid fields to update", 400);
    }

    const updated = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select(
      "username notifications_enabled telegram_chat_id created_at",
    );

    if (!updated) {
      return jsonError("NOT_FOUND", "User not found", 404);
    }

    return jsonOk({
      username: updated.username,
      notifications_enabled: updated.notifications_enabled || false,
      telegram_chat_id: updated.telegram_chat_id || null,
      created_at: updated.created_at,
    });
  } catch (err) {
    logInternalError("profile_handler_error", err, { route: "profile" });
    return jsonError("PROFILE_INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
