import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      default: null,
    },
    email_verified_at: { type: Date, default: null },
    password_hash: { type: String, required: true },
    auth_version: { type: Number, default: 0 },
    notifications_enabled: { type: Boolean, default: false },
    telegram_chat_id: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
