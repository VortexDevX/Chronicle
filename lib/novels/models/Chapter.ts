import mongoose, { Schema, type Model } from "mongoose";
export interface StoredChapter {
  novelSlug: string; number: number; title: string; objectKey: string; wordCount: number;
  bytes: number; sha256: string; verified: boolean; createdAt?: Date;
}
const schema = new Schema<StoredChapter>({
  novelSlug: { type: String, required: true, index: true }, number: { type: Number, required: true, min: 1 },
  title: { type: String, required: true }, objectKey: { type: String, required: true }, wordCount: { type: Number, default: 0 },
  bytes: { type: Number, required: true }, sha256: { type: String, required: true }, verified: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ novelSlug: 1, number: 1 }, { unique: true });
const ChapterModel: Model<StoredChapter> = mongoose.models.HostedChapter || mongoose.model<StoredChapter>("HostedChapter", schema);
export default ChapterModel;
