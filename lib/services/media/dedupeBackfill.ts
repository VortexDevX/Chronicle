import { buildTitleKey } from "./validation";

export type MediaDedupeBackfillItem = {
  _id: unknown;
  user_id: unknown;
  title?: string | null;
  media_type?: string | null;
  dedupe_key?: string | null;
};

export type MediaDedupeBackfillPlan = {
  updates: { id: unknown; dedupe_key: string }[];
  skipped: { id: unknown; reason: "missing_fields" | "duplicate_group" }[];
};

function groupKey(item: MediaDedupeBackfillItem, dedupeKey: string): string {
  return `${String(item.user_id)}\u0000${String(item.media_type)}\u0000${dedupeKey}`;
}

export function planMediaDedupeBackfill(
  items: MediaDedupeBackfillItem[],
): MediaDedupeBackfillPlan {
  const claimed = new Set<string>();
  const updates: MediaDedupeBackfillPlan["updates"] = [];
  const skipped: MediaDedupeBackfillPlan["skipped"] = [];

  for (const item of items) {
    if (!item.title || !item.media_type || !item.user_id) {
      skipped.push({ id: item._id, reason: "missing_fields" });
      continue;
    }

    const dedupeKey = item.dedupe_key || buildTitleKey(item.title);
    const key = groupKey(item, dedupeKey);

    if (claimed.has(key)) {
      skipped.push({ id: item._id, reason: "duplicate_group" });
      continue;
    }

    claimed.add(key);
    if (!item.dedupe_key) {
      updates.push({ id: item._id, dedupe_key: dedupeKey });
    }
  }

  return { updates, skipped };
}
