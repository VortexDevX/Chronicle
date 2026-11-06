import type { MediaItem } from "@/types/media";
export type NovelView = {
  slug: string; title: string; author: string; description: string;
  genres: string[]; status: string; totalChapters: number; cover: string | null;
  createdAt?: string;
  library: MediaItem | null; chapters?: { number: number; title: string }[];
};
export {defaultSettings,type ReaderSettings} from "@/lib/novels/reader-settings";
