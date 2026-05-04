import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    media_type: {
      type: String,
      enum: ["Anime", "Manhwa", "Donghua", "Light Novel"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Planned", "Active", "On Hold", "Dropped", "Completed"],
      required: true,
    },
    progress_current: { type: Number, default: 0 },
    progress_total: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 10 },
    notes: { type: String },
    drop_reason: { type: String, default: null },
    retry_flag: { type: Boolean, default: false },
    last_updated: { type: Date, default: Date.now },
    external_status: {
      type: String,
      enum: ["ongoing", "completed", "hiatus", "cancelled", null],
      default: null,
    },
    tracker_url: { type: String, default: null },
    mangadex_id: { type: String, default: null },
    custom_cover_url: { type: String, default: null },
    linked_entries: [{ type: mongoose.Schema.Types.ObjectId, ref: "MediaItem" }],
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

mediaSchema.index({ user_id: 1, last_updated: -1 });
mediaSchema.index({ user_id: 1, media_type: 1 });
mediaSchema.index({ user_id: 1, status: 1, last_updated: -1 });
mediaSchema.index({ user_id: 1, media_type: 1, status: 1, last_updated: -1 });
mediaSchema.index({ user_id: 1, title: 1 });

mediaSchema.pre("findOneAndUpdate", function (next) {
  this.set({ last_updated: new Date() });
  next();
});

export const MediaItem =
  mongoose.models.MediaItem || mongoose.model("MediaItem", mediaSchema);
