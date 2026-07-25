import mongoose from "mongoose";
import { ProgressActivity } from "@/lib/models";
import type { ActivityDay, ActivityItem, ActivityPayload } from "@/types/media";

const ACTIVITY_DAYS = 7;

type ActivityFacetResult = {
  recent?: Array<{
    _id: unknown;
    media_id: unknown;
    delta: number;
    occurred_at: Date;
    media?: Array<{ title?: string; media_type?: string }>;
  }>;
  daily?: Array<{ _id: string; units: number; events: number }>;
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function emptyActivityDays(anchor = new Date()): ActivityDay[] {
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - (ACTIVITY_DAYS - index - 1));
    return { date: dayKey(date), units: 0, events: 0 };
  });
}

export async function getActivitySnapshot(
  userObjectId: mongoose.Types.ObjectId,
  recentLimit = 8,
  anchor = new Date(),
): Promise<ActivityPayload> {
  const since = new Date(anchor);
  since.setUTCDate(since.getUTCDate() - (ACTIVITY_DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [result] = (await ProgressActivity.aggregate([
    { $match: { user_id: userObjectId, occurred_at: { $gte: since } } },
    {
      $facet: {
        recent: [
          { $sort: { occurred_at: -1 } },
          { $limit: recentLimit },
          {
            $lookup: {
              from: "mediaitems",
              localField: "media_id",
              foreignField: "_id",
              as: "media",
            },
          },
          { $match: { "media.0": { $exists: true } } },
        ],
        daily: [
          { $match: { delta: { $gt: 0 } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: "$occurred_at",
                  format: "%Y-%m-%d",
                  timezone: "UTC",
                },
              },
              units: { $sum: "$delta" },
              events: { $sum: 1 },
            },
          },
        ],
      },
    },
  ])) as ActivityFacetResult[];

  const byDay = new Map(
    (result?.daily || []).map((day) => [
      day._id,
      {
        units: Math.round(Number(day.units || 0) * 1000) / 1000,
        events: Number(day.events || 0),
      },
    ]),
  );

  const days = emptyActivityDays(anchor).map((day) => ({
    ...day,
    ...(byDay.get(day.date) || {}),
  }));

  const events: ActivityItem[] = (result?.recent || []).map((event) => ({
    _id: String(event._id),
    media_id: String(event.media_id),
    title: String(event.media?.[0]?.title || "Unknown title"),
    media_type: String(event.media?.[0]?.media_type || "Media"),
    delta: Number(event.delta),
    occurred_at: new Date(event.occurred_at).toISOString(),
  }));

  return { events, days };
}
