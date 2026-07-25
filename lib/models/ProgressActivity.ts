import mongoose from "mongoose";

export const ACTIVITY_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const progressActivitySchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    media_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaItem",
      required: true,
    },
    delta: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) => Number.isFinite(value) && value !== 0,
        message: "Activity delta must be a finite non-zero number",
      },
    },
    occurred_at: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);

progressActivitySchema.index({ user_id: 1, occurred_at: -1 });
progressActivitySchema.index({ media_id: 1, occurred_at: -1 });
progressActivitySchema.index(
  { occurred_at: 1 },
  { expireAfterSeconds: ACTIVITY_RETENTION_SECONDS },
);

export const ProgressActivity =
  mongoose.models.ProgressActivity ||
  mongoose.model("ProgressActivity", progressActivitySchema);
