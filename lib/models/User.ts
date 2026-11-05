import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    is_admin: { type: Boolean, default: false },
    avatar_object_key: { type: String, default: null },
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
    push_notifications_enabled: { type: Boolean, default: false },
    telegram_chat_id: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

const existingUser = mongoose.models.User;
if (existingUser && !existingUser.schema.path("is_admin")) {
  existingUser.schema.add({ is_admin: { type: Boolean, default: false }, avatar_object_key: { type: String, default: null } });
}
export const User = existingUser || mongoose.model("User", userSchema);
