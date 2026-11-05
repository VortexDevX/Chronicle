import mongoose, { Schema, Model } from "mongoose";
import { Novel } from "@/types/novels";

const NovelSchema = new Schema<Novel>(
  {
    storageBackend: { type: String, enum: ["local", "r2"] },
    coverObjectKey: String,
    uploadState: { type: String, enum: ["draft", "uploading", "ready", "failed"] },
    uploadId: String,
    expectedChapters: Number,
    coverBytes: Number,
    coverSha256: String,
    slug: { type: String, index: true, unique: true, sparse: true },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    author: {
      type: String,
      required: [true, "Author is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    customCover: {
      type: String,
      default: "",
    },
    genres: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["ongoing", "completed", "hiatus"],
      default: "ongoing",
    },
    totalChapters: {
      type: Number,
      default: 0,
    },
    folderPath: {
      type: String,
      default: "",
    },
    addedBy: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const NovelModel: Model<Novel> =
  mongoose.models.HostedNovel || mongoose.model<Novel>("HostedNovel", NovelSchema);

export default NovelModel;
