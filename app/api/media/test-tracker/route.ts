import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { MediaItem } from "@/lib/models";
import { requireAuthUserId, enforceRateLimit } from "@/lib/guards";
import { jsonOk, jsonError } from "@/lib/http";
import { getClientIp } from "@/lib/rateLimit";
import { normalizePublicHttpUrl } from "@/lib/publicUrl";
import {
  MediaTypeSupported,
  getErrorMessage,
  scrapeTrackerUrl,
} from "@/lib/trackerScraper";
import mongoose from "mongoose";

function isSupportedMediaType(value: string): value is MediaTypeSupported {
  return value === "Manhwa" || value === "Donghua";
}

export async function POST(req: NextRequest) {
  await connectDB();
  const { userId, errorResponse } = await requireAuthUserId(req);
  if (!userId && errorResponse) return errorResponse;

  const ip = getClientIp(req);
  const guard = await enforceRateLimit(req, {
    key: `media:test_tracker:${userId}:${ip}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
    strict: true,
    route: "media/test-tracker",
    method: "POST",
    operation: "test_tracker",
    userId,
    message: "Too many tracker tests. Please retry shortly.",
  });
  if (!guard.allowed && guard.errorResponse) return guard.errorResponse;

  const body = await req.json().catch(() => ({}));
  const trackerUrl = normalizePublicHttpUrl(String(body.tracker_url || "").trim());
  const mediaType = String(body.media_type || "");
  const itemId =
    typeof body.id === "string" && mongoose.Types.ObjectId.isValid(body.id)
      ? body.id
      : null;

  if (!trackerUrl) {
    return jsonError("INVALID_TRACKER_URL", "Enter a valid public tracker URL", 400);
  }

  if (!isSupportedMediaType(mediaType)) {
    return jsonError("UNSUPPORTED_MEDIA_TYPE", "Tracker test supports Manhwa and Donghua", 400);
  }

  try {
    const latest = await scrapeTrackerUrl(trackerUrl, mediaType);

    if (itemId) {
      await MediaItem.updateOne(
        { _id: itemId, user_id: userId },
        {
          $set: {
            last_checked_at: new Date(),
            last_scrape_status: "ok",
            last_scrape_error: null,
            latest_remote_progress: latest,
          },
        },
      );
    }

    return jsonOk({ latest });
  } catch (err) {
    const message = getErrorMessage(err);

    if (itemId) {
      await MediaItem.updateOne(
        { _id: itemId, user_id: userId },
        {
          $set: {
            last_checked_at: new Date(),
            last_scrape_status: "error",
            last_scrape_error: message.slice(0, 500),
          },
        },
      );
    }

    return jsonError("TRACKER_TEST_FAILED", message, 400);
  }
}
