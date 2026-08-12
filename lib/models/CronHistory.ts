import mongoose from "mongoose";

export const CRON_HISTORY_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export const CRON_DELIVERY_STATES = [
  "not_needed",
  "disabled",
  "unavailable",
  "sent",
  "partial",
  "failed",
  "deferred",
] as const;

const cronHistoryUpdateSchema = new mongoose.Schema(
  {
    media_id: { type: mongoose.Schema.Types.ObjectId, ref: "MediaItem" },
    title: { type: String, required: true },
    media_type: { type: String, required: true },
    current: { type: Number, required: true },
    latest: { type: Number, required: true },
  },
  { _id: false },
);

const cronHistoryErrorSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false },
);

const cronHistorySchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    started_at: { type: Date, required: true },
    completed_at: { type: Date, required: true },
    expires_at: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + CRON_HISTORY_RETENTION_SECONDS * 1000),
    },
    status: { type: String, enum: ["success", "partial"], required: true },
    selected: { type: Number, required: true, min: 0 },
    checked: { type: Number, required: true, min: 0 },
    updates_found: { type: Number, required: true, min: 0 },
    tracker_failures: { type: Number, required: true, min: 0 },
    deferred: { type: Number, required: true, min: 0 },
    duration_ms: { type: Number, required: true, min: 0 },
    telegram_delivery: {
      type: String,
      enum: CRON_DELIVERY_STATES,
      required: true,
    },
    push_delivery: {
      type: String,
      enum: CRON_DELIVERY_STATES,
      required: true,
    },
    updates: { type: [cronHistoryUpdateSchema], default: [] },
    tracker_errors: { type: [cronHistoryErrorSchema], default: [] },
  },
  { versionKey: false },
);

cronHistorySchema.index({ user_id: 1, started_at: -1 });
cronHistorySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const CronHistory =
  mongoose.models.CronHistory || mongoose.model("CronHistory", cronHistorySchema);
