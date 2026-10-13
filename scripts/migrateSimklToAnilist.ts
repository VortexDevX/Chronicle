import { connectDB } from "../lib/db";
import { MediaItem } from "../lib/models";
import {
  MigrationCandidate,
  planSimklToAniListMigration,
} from "../lib/services/media/simklMigration";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  await connectDB();

  const items = (await MediaItem.find({
    media_type: { $in: ["Anime", "Donghua"] },
  })
    .select("_id title media_type anilist_id simkl_id")
    .sort({ created_at: 1, _id: 1 })
    .lean()) as unknown as MigrationCandidate[];

  process.stdout.write(`Scanning ${items.length} Anime/Donghua entries...\n`);

  const plan = await planSimklToAniListMigration(items);

  const exactMatches = plan.results.filter((r) => r.status === "exact_match");

  if (!isDryRun && exactMatches.length > 0) {
    const updates = exactMatches.map((match) => ({
      updateOne: {
        filter: { _id: match.id },
        update: { $set: { anilist_id: match.anilistId } },
      },
    }));
    await MediaItem.bulkWrite(updates, { ordered: false });
  }

  process.stdout.write(
    [
      `Mode: ${isDryRun ? "DRY RUN (no database writes)" : "APPLIED"}`,
      `Total scanned: ${items.length}`,
      `Already mapped to AniList: ${plan.alreadyVerifiedCount}`,
      `Exact matches ${isDryRun ? "found" : "updated"}: ${plan.matchedCount}`,
      `Ambiguous / Manual review needed: ${plan.ambiguousCount}`,
    ].join("\n") + "\n\n",
  );

  const reviewNeeded = plan.results.filter(
    (r) => r.status === "manual_review_needed" || r.status === "not_found",
  );
  if (reviewNeeded.length > 0) {
    process.stdout.write("Items flagged for manual review:\n");
    for (const item of reviewNeeded) {
      process.stdout.write(` - [${item.title}]: ${item.reason}\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(
    `${err instanceof Error ? err.message : "migration_failed"}\n`,
  );
  process.exitCode = 1;
});
