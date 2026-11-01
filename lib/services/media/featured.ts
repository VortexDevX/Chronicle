import mongoose from "mongoose";
import { MediaItem } from "@/lib/models";
import type { MediaItem as Media } from "@/types/media";

/** A fresh draw from the whole active collection, never a prefetched rotation pool. */
export async function sampleActiveMedia(userId: mongoose.Types.ObjectId, exclude?: string): Promise<Media | null> {
  const match = { user_id: userId, status: { $in: ["Active", "Watching/Reading"] } };
  const draw = (filter: object) => MediaItem.aggregate([{ $match: filter }, { $sample: { size: 1 } }]);
  const items = await draw(exclude ? { ...match, _id: { $ne: new mongoose.Types.ObjectId(exclude) } } : match);
  if (items[0]) return items[0] as Media;
  // A single active title remains usable; another user's collection is never a fallback.
  return exclude ? ((await draw(match))[0] as Media | undefined) ?? null : null;
}
