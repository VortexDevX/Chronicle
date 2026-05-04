import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    notifications_enabled: { type: Boolean, default: false },
    telegram_chat_id: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
