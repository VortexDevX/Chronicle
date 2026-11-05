import mongoose from "mongoose";
const schema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  novel_slug: { type: String, required: true },
  chapter: { type: Number, required: true },
  paragraph: { type: Number, default: 0 },
  selected_text: { type: String, default: "" },
  note: { type: String, default: "" },
  tags: { type: [String], default: [] },
  color: { type: String, default: "sage" },
}, { timestamps: true });
schema.index({ user_id: 1, createdAt: -1 });
export const NovelBookmark = mongoose.models.NovelBookmark || mongoose.model("NovelBookmark", schema);
