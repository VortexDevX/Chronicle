import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  jsonOk,
  jsonError,
  handleOptions,
  setCors,
} from "../_utils/response.js";
import { connectDB } from "../_utils/db.js";
import { verifyToken } from "../_utils/auth.js";
import { User } from "../_utils/db.js";

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
      const user = await User.findById(userId).lean();
      if (!user) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }

      return jsonOk(res, {
        telegram_chat_id: user.telegram_chat_id || "",
        notifications_enabled: user.notifications_enabled || false,
      });
    }

    if (req.method === "PUT") {
      const { telegram_chat_id, notifications_enabled } = req.body || {};

      const updatePayload: Record<string, any> = {};

      if (telegram_chat_id !== undefined) {
        updatePayload.telegram_chat_id = String(telegram_chat_id).trim();
      }

      if (notifications_enabled !== undefined) {
        updatePayload.notifications_enabled = Boolean(notifications_enabled);
      }

      const updated = await User.findByIdAndUpdate(
        userId,
        { $set: updatePayload },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) {
        return jsonError(res, "NOT_FOUND", "User not found", 404);
      }

      return jsonOk(res, {
        telegram_chat_id: updated.telegram_chat_id || "",
        notifications_enabled: updated.notifications_enabled || false,
      });
    }

    return jsonError(res, "METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  } catch (error: any) {
    console.error("[Settings API error]", error);
    return jsonError(res, "INTERNAL_ERROR", error.message, 500);
  }
}
