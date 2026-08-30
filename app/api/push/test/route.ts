import { NextRequest } from "next/server";
import { enforceRateLimit, requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInfo, logInternalError } from "@/lib/log";
import { PushDevice, User } from "@/lib/models";
import { isAndroidPushConfigured, sendAndroidPush } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const guard = await enforceRateLimit(req, {
      key: `push:test:${userId}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
      route: "push/test",
      method: "POST",
      userId,
      message: "Too many test notifications. Try again in a few minutes.",
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    if (!isAndroidPushConfigured()) {
      return jsonError(
        "PUSH_NOT_CONFIGURED",
        "Android push is not configured on the server",
        503,
      );
    }

    const user = (await User.findById(userId)
      .select("push_notifications_enabled")
      .lean()) as { push_notifications_enabled?: boolean } | null;
    if (!user?.push_notifications_enabled) {
      return jsonError(
        "PUSH_DISABLED",
        "Turn on Android push notifications first",
        409,
      );
    }

    const devices = await PushDevice.find({
      user_id: userId,
      platform: "android",
    })
      .select("token")
      .sort({ last_seen_at: -1 })
      .limit(20)
      .lean();
    const tokens = devices
      .map((device) => String(device.token || ""))
      .filter(Boolean);

    if (tokens.length === 0) {
      return jsonError(
        "NO_PUSH_DEVICE",
        "No Android device is registered. Open Chronicle on Android and try again.",
        409,
      );
    }

    const result = await sendAndroidPush(tokens, {
      title: "Chronicle test notification",
      body: "Push is connected and ready for release alerts.",
      path: "/updates",
    });

    if (result.invalidTokens.length > 0) {
      await PushDevice.deleteMany({
        user_id: userId,
        token: { $in: result.invalidTokens },
      });
    }

    logInfo("android_push_test_complete", {
      user_id: userId,
      devices: tokens.length,
      sent: result.sent,
      failed: result.failed,
      invalidated: result.invalidTokens.length,
    });

    if (result.sent === 0) {
      return jsonError(
        "PUSH_TEST_FAILED",
        "Firebase could not deliver the test notification",
        502,
      );
    }

    return jsonOk({
      sent: result.sent,
      failed: result.failed,
      devices: tokens.length,
    });
  } catch (err) {
    logInternalError("android_push_test_error", err, { route: "push/test" });
    return jsonError(
      "PUSH_TEST_INTERNAL_ERROR",
      "Could not send the test notification",
      500,
    );
  }
}
