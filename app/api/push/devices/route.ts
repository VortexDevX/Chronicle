import { NextRequest } from "next/server";
import { PushDevice, User } from "@/lib/models";
import { enforceRateLimit, requireAuthUserId } from "@/lib/guards";
import { jsonError, jsonOk } from "@/lib/http";
import { logInternalError } from "@/lib/log";
import { isAndroidPushConfigured } from "@/lib/push";

const INSTALLATION_COOKIE = "chronicle_android_installation";
const INSTALLATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TOKEN_LENGTH = 4096;
const MAX_APP_VERSION_LENGTH = 50;

function getInstallationId(req: NextRequest): string | null {
  const value = req.cookies.get(INSTALLATION_COOKIE)?.value?.trim() || "";
  return INSTALLATION_ID_PATTERN.test(value) ? value : null;
}

function getToken(body: Record<string, unknown>): string | null {
  if (typeof body.token !== "string") return null;
  const token = body.token.trim();
  if (token.length < 20 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

export async function GET(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const [devices, userResult] = await Promise.all([
      PushDevice.find({ user_id: userId, platform: "android" })
        .select("app_version last_seen_at")
        .sort({ last_seen_at: -1 })
        .limit(20)
        .lean(),
      User.findById(userId)
        .select("push_notifications_enabled")
        .lean(),
    ]);
    const user = userResult as { push_notifications_enabled?: boolean } | null;

    return jsonOk({
      registered: devices.length > 0,
      deviceCount: devices.length,
      pushEnabled: Boolean(user?.push_notifications_enabled),
      configured: isAndroidPushConfigured(),
      devices: devices.map((device) => ({
        appVersion: device.app_version || null,
        lastSeenAt: device.last_seen_at || null,
      })),
    });
  } catch (err) {
    logInternalError("push_device_status_error", err, {
      route: "push/devices",
    });
    return jsonError(
      "PUSH_DEVICE_INTERNAL_ERROR",
      "Could not check Android push status",
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const guard = await enforceRateLimit(req, {
      key: `push-device:register:${userId}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
      route: "push/devices",
      method: "POST",
      userId,
    });
    if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

    const installationId = getInstallationId(req);
    if (!installationId) {
      return jsonError(
        "INVALID_INSTALLATION",
        "Android installation identity is missing or invalid",
        400,
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const token = getToken(body);
    if (!token) {
      return jsonError("INVALID_PUSH_TOKEN", "Push token is invalid", 400);
    }

    const appVersion =
      typeof body.appVersion === "string"
        ? body.appVersion.trim().slice(0, MAX_APP_VERSION_LENGTH) || null
        : null;

    const existingDevice = (await PushDevice.findOne({
      installation_id: installationId,
    })
      .select("user_id")
      .lean()) as { user_id?: unknown } | null;
    if (existingDevice && String(existingDevice.user_id) !== userId) {
      return jsonError(
        "INSTALLATION_ALREADY_REGISTERED",
        "This Android installation belongs to another signed-in account",
        409,
      );
    }

    await PushDevice.findOneAndUpdate(
      { installation_id: installationId },
      {
        $set: {
          user_id: userId,
          token,
          platform: "android",
          app_version: appVersion,
          last_seen_at: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    if (!existingDevice || body.enableNotifications === true) {
      await User.updateOne(
        { _id: userId },
        { $set: { push_notifications_enabled: true } },
      );
    }

    return jsonOk({ registered: true, platform: "android" });
  } catch (err) {
    logInternalError("push_device_register_error", err, {
      route: "push/devices",
    });
    return jsonError(
      "PUSH_DEVICE_INTERNAL_ERROR",
      "Could not register this device",
      500,
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, errorResponse } = await requireAuthUserId(req);
    if (!userId && errorResponse) return errorResponse;

    const installationId = getInstallationId(req);
    if (!installationId) {
      return jsonError(
        "INVALID_INSTALLATION",
        "Android installation identity is missing or invalid",
        400,
      );
    }

    await PushDevice.deleteOne({
      user_id: userId,
      installation_id: installationId,
    });

    return jsonOk({ registered: false });
  } catch (err) {
    logInternalError("push_device_delete_error", err, {
      route: "push/devices",
    });
    return jsonError(
      "PUSH_DEVICE_INTERNAL_ERROR",
      "Could not remove this device",
      500,
    );
  }
}
