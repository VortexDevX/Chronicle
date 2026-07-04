import mongoose from "mongoose";

const emailVerificationTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    token_hash: { type: String, required: true, unique: true },
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

emailVerificationTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken =
  mongoose.models.EmailVerificationToken ||
  mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
