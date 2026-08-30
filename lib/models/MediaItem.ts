import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    dedupe_key: { type: String, default: null },
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
    anilist_id: { type: Number, default: null },
    simkl_id: { type: Number, default: null },
    schedule_source_url: { type: String, default: null },
    next_episode: { type: Number, default: null },
    next_episode_release_at: { type: Date, default: null },
    previous_episode: { type: Number, default: null },
    previous_episode_release_at: { type: Date, default: null },
    release_platform: { type: String, default: null },
    last_attempted_at: { type: Date, default: null },
    last_checked_at: { type: Date, default: null },
    last_scrape_status: {
      type: String,
      enum: ["ok", "error", null],
      default: null,
    },
    last_scrape_error: { type: String, default: null },
    latest_remote_progress: { type: Number, default: null },
    last_notified_progress: { type: Number, default: null },
    last_push_notified_progress: { type: Number, default: null },
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
mediaSchema.index({
  media_type: 1,
  status: 1,
  last_attempted_at: 1,
  last_checked_at: 1,
});
mediaSchema.index({ media_type: 1, status: 1, next_episode_release_at: 1 });
mediaSchema.index(
  { user_id: 1, media_type: 1, dedupe_key: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupe_key: { $type: "string" } },
  },
);

mediaSchema.pre("findOneAndUpdate", function (next) {
  this.set({ last_updated: new Date() });
  next();
});

// Next.js keeps Mongoose models alive across dev hot reloads. Add newly introduced
// fields to an already-cached model so updates are not silently stripped locally.
const existingMediaItem = mongoose.models.MediaItem;
if (existingMediaItem && !existingMediaItem.schema.path("simkl_id")) {
  existingMediaItem.schema.add({ simkl_id: { type: Number, default: null } });
}

export const MediaItem =
  existingMediaItem || mongoose.model("MediaItem", mediaSchema);
