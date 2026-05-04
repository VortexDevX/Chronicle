/**
 * notify.ts — Telegram notification utility
 *
 * Supports both global (env-based) and per-user (chat ID param) notifications.
 */

import { logInfo, logInternalError } from "@/lib/log";

/** Escape HTML entities for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send a Telegram message to a specific chat ID.
 * Returns true on success, false on failure.
 */
export async function sendTelegramToChat(
  chatId: string,
  message: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logInfo("telegram_notification_skipped", { reason: "missing_token" });
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  // Telegram messages have a 4096 character limit
  const truncated =
    message.length > 4000
      ? message.slice(0, 3980) + "\n\n<i>… truncated</i>"
      : message;

  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncated,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logInternalError("telegram_api_error", new Error(body || res.statusText), {
        status: res.status,
      });
      return false;
    }
    return true;
  } catch (err) {
    logInternalError("telegram_request_failed", err);
    return false;
  }
}

/**
 * Send a Telegram message using the global TELEGRAM_CHAT_ID env var.
 * Fallback for when no per-user chat ID is available.
 */
export async function sendTelegram(message: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    logInfo("telegram_notification_skipped", { reason: "missing_chat_id" });
    return false;
  }
  return sendTelegramToChat(chatId, message);
}
