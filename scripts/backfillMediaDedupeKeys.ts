import { connectDB } from "../lib/db";
import { MediaItem } from "../lib/models";
import {
  MediaDedupeBackfillItem,
  planMediaDedupeBackfill,
} from "../lib/services/media/dedupeBackfill";

async function main() {
  await connectDB();

  const items = (await MediaItem.find({})
    .select("_id user_id title media_type dedupe_key")
    .sort({ created_at: 1, _id: 1 })
    .lean()) as unknown as MediaDedupeBackfillItem[];

  const plan = planMediaDedupeBackfill(items);

  if (plan.updates.length > 0) {
    await MediaItem.bulkWrite(
      plan.updates.map((update) => ({
        updateOne: {
          filter: { _id: update.id, dedupe_key: { $in: [null, ""] } },
          update: { $set: { dedupe_key: update.dedupe_key } },
        },
      })),
      { ordered: false },
    );
  }

  process.stdout.write(
    [
      `Scanned: ${items.length}`,
      `Updated: ${plan.updates.length}`,
      `Skipped duplicates: ${
        plan.skipped.filter((item) => item.reason === "duplicate_group").length
      }`,
      `Skipped invalid: ${
        plan.skipped.filter((item) => item.reason === "missing_fields").length
      }`,
    ].join("\n") + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(
    `${err instanceof Error ? err.message : "dedupe_backfill_failed"}\n`,
  );
  process.exitCode = 1;
});
