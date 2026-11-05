/** Catalogue-only migration. Dry-run unless --apply; never changes source data. */
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import mongoose from "mongoose";
import { loadEnvConfig } from "@next/env";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2Connection } from "../lib/novels/storage/r2";

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const option = (key: string) => args[args.indexOf(key) + 1];
  if (!args.includes("--source-env")) throw new Error("Pass --source-env <Nocturne .env path>. Add --apply only after reviewing the dry run.");
  const sourceEnv = parseEnv(await readFile(option("--source-env"), "utf8"));
  const targetUri = process.env.MONGODB_URI;
  if (!sourceEnv.MONGODB_URI || !targetUri) throw new Error("Both database connections are required");
  const source = await mongoose.createConnection(sourceEnv.MONGODB_URI, { dbName: sourceEnv.MONGODB_DB_NAME || "nocturne" }).asPromise();
  const target = await mongoose.createConnection(targetUri).asPromise();
  try {
    if (source.host === target.host && source.name === target.name) throw new Error("Source and target must be different databases");
    const users = target.collection("users");
    const ownerFilter = args.includes("--owner-email") ? { email: option("--owner-email").toLowerCase() } : {};
    const owners = await users.find(ownerFilter, { projection: { _id: 1, username: 1 } }).limit(2).toArray();
    if (owners.length !== 1) throw new Error("Specify --owner-email to identify exactly one existing Chronicle account");
    const owner = owners[0];
    const novels = await source.collection("novels").find({ uploadState: "ready", storageBackend: "r2" }).toArray();
    const chapters = await source.collection("chapters").find({ novelSlug: { $in: novels.map(n => n.slug) }, verified: true }).toArray();
    if (!novels.length) throw new Error("No published R2 novels found; nothing to migrate");
    // The existing Nocturne bucket is the source of truth for objects.
    for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_JURISDICTION"]) {
      if (sourceEnv[key]) process.env[key] = sourceEnv[key];
    }
    const objects: { key: string; bytes?: number }[] = [];
    for (const novel of novels) {
      if (!/^[a-zA-Z0-9_-]+$/.test(novel.slug)) throw new Error("Invalid novel slug");
      const rows = chapters.filter(c => c.novelSlug === novel.slug);
      if (rows.length !== novel.totalChapters || new Set(rows.map(c => c.number)).size !== rows.length) throw new Error(`Chapter count mismatch: ${novel.slug}`);
      const existing = await target.collection("hostednovels").findOne({ slug: novel.slug });
      if (existing && existing.migration_source !== "nocturne") throw new Error(`Target slug already belongs to another upload: ${novel.slug}`);
      if (novel.coverObjectKey) objects.push({ key: novel.coverObjectKey, bytes: novel.coverBytes });
      objects.push(...rows.map(c => ({ key: c.objectKey, bytes: c.bytes })));
    }
    const { client, bucket } = r2Connection();
    const inventory = new Map<string, number>();
    let continuation: string | undefined;
    do {
      const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "novels/", ContinuationToken: continuation }));
      for (const object of result.Contents || []) if (object.Key) inventory.set(object.Key, object.Size || 0);
      continuation = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuation);
    for (const object of objects) {
      if (!object.key.startsWith("novels/")) throw new Error("Unexpected object key outside novel storage");
      if (!inventory.has(object.key) || (object.bytes !== undefined && inventory.get(object.key) !== object.bytes)) throw new Error(`Missing or incorrect object: ${object.key}`);
    }
    console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "dry-run", owner: owner.username, novels: novels.length, chapters: chapters.length, verifiedObjects: objects.length, userDataImported: 0 }));
    if (!args.includes("--apply")) return;
    const targetNovels = target.collection("hostednovels"), targetChapters = target.collection("hostedchapters");
    await targetNovels.createIndex({ slug: 1 }, { unique: true, sparse: true });
    await targetChapters.createIndex({ novelSlug: 1, number: 1 }, { unique: true });
    for (const novel of novels) {
      const data = Object.fromEntries(["slug","title","author","description","genres","status","totalChapters","storageBackend","coverObjectKey","coverBytes","coverSha256","createdAt","updatedAt"].filter(k => novel[k] !== undefined).map(k => [k,novel[k]]));
      // Copy as draft first. Interrupted migrations cannot publish incomplete chapter indexes.
      await targetNovels.updateOne({ slug: novel.slug }, { $set: { ...data, addedBy: String(owner._id), uploadState: "draft", migration_source: "nocturne", isPublic: false } }, { upsert: true });
      const operations = chapters.filter(c => c.novelSlug === novel.slug).map(chapter => {
        const data = Object.fromEntries(["novelSlug","number","title","objectKey","wordCount","bytes","sha256","verified","createdAt","updatedAt"].filter(k => chapter[k] !== undefined).map(k => [k,chapter[k]]));
        return { updateOne: { filter: { novelSlug: chapter.novelSlug, number: chapter.number }, update: { $set: data }, upsert: true } };
      });
      for (let start = 0; start < operations.length; start += 500) await targetChapters.bulkWrite(operations.slice(start, start + 500));
      const count = await targetChapters.countDocuments({ novelSlug: novel.slug, verified: true });
      if (count !== novel.totalChapters) throw new Error(`Target chapter count mismatch: ${novel.slug}`);
      await targetNovels.updateOne({ slug: novel.slug }, { $set: { uploadState: "ready" } });
    }
    await users.updateOne({ _id: owner._id }, { $set: { is_admin: true } });
    console.log("Catalogue imported and verified. Chronicle owner promoted to admin. Source and R2 objects unchanged.");
  } finally { await source.close(); await target.close(); }
}
main().catch(error => { console.error("Migration failed:", error?.name, error?.code || "", /^(Pass |Both |Source |Specify |No published|Invalid novel|Chapter count|Target slug|Unexpected object|Missing or incorrect|Target chapter)/.test(error?.message || "") ? error.message : "Check database and R2 connectivity. No source data was deleted."); process.exitCode = 1; });
