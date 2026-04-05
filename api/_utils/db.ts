import mongoose from "mongoose";

let cachedDb: typeof mongoose | null = null;

export const connectDB = async () => {
  if (cachedDb) return cachedDb;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not defined in the environment variables. Please configure it in your Vercel Dashboard.",
    );
  }
  cachedDb = await mongoose.connect(MONGODB_URI);
  return cachedDb;
};

// ── User ───────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },

    // Notification settings
    notifications_enabled: { type: Boolean, default: false },
    telegram_chat_id: { type: String, default: null },

    // Profile fields (Phase 5)
    display_name: { type: String, default: null },
    bio: { type: String, default: null },
    public_profile_enabled: { type: Boolean, default: false },
    public_slug: { type: String, default: null },
    avatar_url: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

// Ensure public slugs are unique (sparse — only enforced when non-null)
userSchema.index({ public_slug: 1 }, { unique: true, sparse: true });

export const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── Media ──────────────────────────────────────────────────────────

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
      enum: ["Planned", "Watching/Reading", "On Hold", "Dropped", "Completed"],
      required: true,
    },
    progress_current: { type: Number, default: 0 },
    progress_total: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 10 },
    notes: { type: String },
    last_updated: { type: Date, default: Date.now },

    // ── External tracking fields ─────────────────────────────────
    external_status: {
      type: String,
      enum: ["ongoing", "completed", "hiatus", "cancelled", null],
      default: null,
    },
    read_url: { type: String, default: null },
    tracker_url: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

// --- Indexes ---
mediaSchema.index({ user_id: 1, last_updated: -1 });
mediaSchema.index({ user_id: 1, media_type: 1 });

// Auto-update last_updated field
mediaSchema.pre("findOneAndUpdate", function (next) {
  this.set({ last_updated: new Date() });
  next();
});

export const MediaItem =
  mongoose.models.MediaItem || mongoose.model("MediaItem", mediaSchema);
