export interface Novel {
  _id: string;
  slug?: string;
  title: string;
  author: string;
  description: string;
  coverImage?: string;
  customCover?: string;
  genres: string[];
  status: "ongoing" | "completed" | "hiatus";
  totalChapters: number;
  folderPath: string;
  storageBackend?: "r2" | "local";
  coverObjectKey?: string;
  uploadState?: "draft" | "uploading" | "ready" | "failed";
  uploadId?: string;
  expectedChapters?: number;
  coverBytes?: number;
  coverSha256?: string;
  addedBy: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}
