import mongoose from "mongoose";

let cachedDb: typeof mongoose | null = null;

export const connectDB = async () => {
  if (cachedDb) return cachedDb;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in the environment variables. Please configure it in your Vercel Dashboard.");
  }
  cachedDb = await mongoose.connect(MONGODB_URI);
  return cachedDb;
};

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);

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
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

// --- Indexes ---
// Primary query: find user's items sorted by last_updated
mediaSchema.index({ user_id: 1, last_updated: -1 });
// Filtered query: find user's items by type
mediaSchema.index({ user_id: 1, media_type: 1 });

// Auto-update last_updated field
mediaSchema.pre("findOneAndUpdate", function (next) {
  this.set({ last_updated: new Date() });
  next();
});

export const MediaItem =
  mongoose.models.MediaItem || mongoose.model("MediaItem", mediaSchema);
