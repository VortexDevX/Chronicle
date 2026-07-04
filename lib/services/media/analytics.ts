import mongoose from "mongoose";

const STATUSES = ["Active", "Completed", "Planned", "On Hold", "Dropped"];
const TYPES = ["Anime", "Manhwa", "Donghua", "Light Novel"];

export type AnalyticsItem = {
  _id: unknown;
  title: string;
  media_type: string;
  status: string;
  progress_current?: number;
  progress_total?: number;
  rating?: number;
  last_updated?: Date;
};

type CountBucket = { _id: string; count: number };

export type AnalyticsAggregationResult = {
  totals?: {
    total?: number;
    ratedCount?: number;
    avgRating?: number | null;
    totalProgress?: number;
    completed?: number;
  }[];
  byStatus?: CountBucket[];
  byType?: CountBucket[];
  recentItems?: AnalyticsItem[];
  topRated?: AnalyticsItem[];
};

export function buildAnalyticsPipeline(
  userObjectId: mongoose.Types.ObjectId,
): mongoose.PipelineStage[] {
  return [
    { $match: { user_id: userObjectId } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              ratedCount: {
                $sum: { $cond: [{ $gt: ["$rating", 0] }, 1, 0] },
              },
              avgRating: {
                $avg: { $cond: [{ $gt: ["$rating", 0] }, "$rating", null] },
              },
              totalProgress: { $sum: { $ifNull: ["$progress_current", 0] } },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
              },
            },
          },
        ],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byType: [{ $group: { _id: "$media_type", count: { $sum: 1 } } }],
        recentItems: [
          { $sort: { last_updated: -1 } },
          { $limit: 5 },
          {
            $project: {
              title: 1,
              media_type: 1,
              status: 1,
              progress_current: 1,
              progress_total: 1,
              rating: 1,
              last_updated: 1,
            },
          },
        ],
        topRated: [
          { $match: { rating: { $gt: 0 } } },
          { $sort: { rating: -1, last_updated: -1 } },
          { $limit: 5 },
          {
            $project: {
              title: 1,
              media_type: 1,
              status: 1,
              progress_current: 1,
              progress_total: 1,
              rating: 1,
              last_updated: 1,
            },
          },
        ],
      },
    },
  ];
}

export function normalizeAnalyticsResult(result: AnalyticsAggregationResult) {
  const totals = result.totals?.[0] || {};
  const total = totals.total || 0;
  const completed = totals.completed || 0;
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const byType = Object.fromEntries(TYPES.map((type) => [type, 0]));

  for (const bucket of result.byStatus || []) {
    const key = bucket._id === "Watching/Reading" ? "Active" : bucket._id;
    byStatus[key] = (byStatus[key] || 0) + bucket.count;
  }

  for (const bucket of result.byType || []) {
    byType[bucket._id] = bucket.count;
  }

  return {
    total,
    byStatus,
    byType,
    avgRating: totals.avgRating || 0,
    ratedCount: totals.ratedCount || 0,
    totalProgress: totals.totalProgress || 0,
    completionRate: total > 0 ? (completed / total) * 100 : 0,
    recentItems: result.recentItems || [],
    topRated: result.topRated || [],
  };
}
