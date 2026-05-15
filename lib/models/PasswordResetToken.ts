import mongoose from "mongoose";

const passwordResetTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token_hash: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

passwordResetTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model("PasswordResetToken", passwordResetTokenSchema);
