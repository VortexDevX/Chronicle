import mongoose from "mongoose";
import { buildTitleKey, MediaPayload, validateMediaPayload } from "./validation";

export type PreparedBulkImport = {
  docs: Record<string, unknown>[];
  skipped: number;
};

export function mediaIdentityKey(mediaType: string, title: string): string {
  return `${mediaType}\u0000${buildTitleKey(title)}`;
}

export function prepareBulkMediaDocs(
  entries: MediaPayload[],
  userObjectId: mongoose.Types.ObjectId,
  existingKeys = new Set<string>(),
): PreparedBulkImport {
  const docs: Record<string, unknown>[] = [];
  const seenKeys = new Set<string>();
  let skipped = 0;

  for (const entry of entries) {
    const validated = validateMediaPayload(entry, false);
    if (!validated.ok) {
      skipped += 1;
      continue;
    }

    const mediaType = String(validated.normalized.media_type || "");
    const title = String(validated.normalized.title || "");
    const titleKey = buildTitleKey(title);
    const identityKey = mediaIdentityKey(mediaType, title);

    if (existingKeys.has(identityKey) || seenKeys.has(identityKey)) {
      skipped += 1;
      continue;
    }

    seenKeys.add(identityKey);
    docs.push({
      ...validated.normalized,
      dedupe_key: titleKey,
      user_id: userObjectId,
      last_updated: new Date(),
    });
  }

  return { docs, skipped };
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}
