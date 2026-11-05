import mongoose from "mongoose";
const schema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true }, bytes: Number, sha256: String, contentType: String,
  expiresAt: { type: Date, expires: 0 },
});
export const AvatarUpload = mongoose.models.AvatarUpload || mongoose.model("AvatarUpload", schema);
