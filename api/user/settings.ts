import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  jsonOk,
  jsonError,
  handleOptions,
  setCors,
} from "../_utils/http.js";
import { connectDB } from "../_utils/db.js";
import { User } from "../_utils/db.js";
import { logInternalError } from "../_utils/log.js";
import { requireAuthUserId } from "../_utils/guards.js";

type UserSettingsDoc = {
  telegram_chat_id?: string | null;
  notifications_enabled?: boolean;
};

function isValidTelegramChatId(value: string): boolean {
  return /^-?\d{1,50}$/.test(value);
}

function toSettingsPayload(user: UserSettingsDoc) {
  return {
    telegram_chat_id: user.telegram_chat_id || "",
    notifications_enabled: Boolean(user.notifications_enabled),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCors(req, res);

  try {
    await connectDB();
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    if (req.method === "GET") {
      const user = (await User.findById(userId).lean()) as UserSettingsDoc | null;
      if (!user) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }

      return jsonOk(res, toSettingsPayload(user));
    }

    if (req.method === "PUT") {
      const { telegram_chat_id, notifications_enabled } = req.body || {};

      const updatePayload: Record<string, string | boolean | null> = {};

      if (telegram_chat_id !== undefined) {
        const chatId = String(telegram_chat_id ?? "").trim();
        if (chatId.length > 50 || (chatId && !isValidTelegramChatId(chatId))) {
          return jsonError(
            res,
            "INVALID_CHAT_ID",
            "telegram_chat_id must be a valid numeric Telegram chat id",
            400,
          );
        }
        updatePayload.telegram_chat_id = chatId || null;
      }

      if (notifications_enabled !== undefined) {
        updatePayload.notifications_enabled = Boolean(notifications_enabled);
      }

      if (Object.keys(updatePayload).length === 0) {
        return jsonError(res, "NO_UPDATES", "No valid fields to update", 400);
      }

      const updated = (await User.findByIdAndUpdate(
        userId,
        { $set: updatePayload },
        { new: true, runValidators: true },
      ).lean()) as UserSettingsDoc | null;

      if (!updated) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }

      return jsonOk(res, toSettingsPayload(updated));
    }

    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  } catch (error) {
    logInternalError("settings_handler_error", error, { route: "user/settings" });
    return jsonError(res, "INTERNAL_ERROR", "Internal Server Error", 500);
  }
}
