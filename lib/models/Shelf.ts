import mongoose from "mongoose";

const shelfSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    media_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "MediaItem" }],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

shelfSchema.index({ user_id: 1, name: 1 }, { unique: true });

export const Shelf =
  mongoose.models.Shelf || mongoose.model("Shelf", shelfSchema);
