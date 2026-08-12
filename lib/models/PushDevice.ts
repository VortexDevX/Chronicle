import mongoose from "mongoose";

const pushDeviceSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    installation_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 4096,
    },
    platform: {
      type: String,
      enum: ["android"],
      default: "android",
      required: true,
    },
    app_version: { type: String, default: null, maxlength: 50 },
    last_seen_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

pushDeviceSchema.index({ user_id: 1, last_seen_at: -1 });

export const PushDevice =
  mongoose.models.PushDevice || mongoose.model("PushDevice", pushDeviceSchema);
