import { test, expect } from "./session";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { deleteObject } from "../lib/novels/storage/r2";

test("real chapter 200 appears in Chronicle library and earlier chapters do not lower it", async ({ page }, info) => {
  const response = await page.request.get("/api/novels");
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const novel = data.items.find((n: { totalChapters: number }) => n.totalChapters >= 200);
  test.skip(!novel, "Requires an imported novel containing chapter 200");
  await page.goto(`/read/${novel.slug}/200`);
  await expect(page.locator(".reader-content h1")).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await (await page.request.get(`/api/novels/${novel.slug}`)).json()).data.library?.progress_current).toBe(200);
  await page.goto("/library");
  const card = page.locator(".media-card").filter({ hasText:novel.title });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".media-card-status")).toHaveText("Active");
  await expect(card.locator(".progress-current-val")).toContainText("200");
  await page.screenshot({ path:info.outputPath("real-library.png"),fullPage:true });
  await page.goto(`/read/${novel.slug}/50`);
  await expect(page.locator(".reader-content h1")).toBeVisible();
  expect((await (await page.request.get(`/api/novels/${novel.slug}`)).json()).data.library.progress_current).toBe(200);
  await page.goto("/novels");
  await expect(page.locator(".nocturne-novel-card")).toHaveCount(data.items.length);
  await expect.poll(() => page.locator(".nocturne-cover img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), { timeout:20000 }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path:info.outputPath("real-catalogue.png"),fullPage:true });
  await page.goto(`/novels/${novel.slug}`);
  await expect(page.locator(".novel-detail-copy h1")).toHaveText(novel.title);
  await expect.poll(() => page.locator(".novel-detail-cover img").evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path:info.outputPath("real-detail.png"),fullPage:true });
  await page.goto(`/read/${novel.slug}/200`);
  await expect(page.locator(".reader-content h1")).toBeVisible();
  await page.screenshot({ path:info.outputPath("real-reader.png"),fullPage:true });
});

test("real avatar direct upload is verified and displayed", async ({ page, sessionToken }, info) => {
  test.skip(process.env.RUN_STORAGE_E2E !== "1", "Requires explicit storage test opt-in and allowed bucket CORS origin");
  const { userId } = jwt.decode(sessionToken) as { userId: string };
  const conn = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  try {
    await page.goto("/novels");
    if (info.project.name === "mobile") {
      await page.getByRole("button",{name:"Open menu for shelves, graveyard, and settings"}).click();
      await page.getByRole("button",{name:"Settings",exact:true}).click();
    } else await page.getByRole("button",{name:"Open profile settings",exact:true}).click();
    await page.getByLabel("Profile photo").setInputFiles({ name:"avatar.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3x8AAAAASUVORK5CYII=","base64") });
    await expect(page.getByText("Avatar updated.",{exact:true})).toBeVisible({ timeout:25000 });
    const avatar = await page.request.get("/api/profile/avatar");
    expect(avatar.status()).toBe(200); expect(avatar.headers()["cache-control"]).toContain("no-store");
    await page.getByRole("button",{name:"Remove photo",exact:true}).click();
    await expect(page.locator(".avatar-editor img")).toHaveCount(0);
  } finally {
    const uploads = await conn.collection("avataruploads").find({ user_id:new mongoose.Types.ObjectId(userId) }).toArray();
    for (const upload of uploads) await deleteObject(upload.key);
    await conn.collection("avataruploads").deleteMany({ user_id:new mongoose.Types.ObjectId(userId) });
    await conn.close();
  }
});

test("admin publishes a real chapter through presigned R2 uploads", async ({ page, sessionToken }) => {
  test.skip(process.env.RUN_STORAGE_E2E !== "1", "Requires explicit storage test opt-in");
  const { userId } = jwt.decode(sessionToken) as { userId: string };
  const id = new mongoose.Types.ObjectId(userId);
  const conn = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  const slug = `chronicle-verification-${randomUUID()}`;
  const title = slug;
  try {
    await conn.collection("users").updateOne({ _id:id },{ $set:{ is_admin:true } });
    await page.goto("/admin/novels/upload");
    await page.getByLabel("Title",{exact:true}).fill(title);
    await page.getByLabel("Author",{exact:true}).fill("Integration verification");
    await page.getByLabel("Cover (JPEG, PNG or WebP; 3 MiB maximum)").setInputFiles({ name:"cover.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3x8AAAAASUVORK5CYII=","base64") });
    await page.getByLabel("Individual chapters").setInputFiles({ name:"Chapter 1.txt",mimeType:"text/plain",buffer:Buffer.from("Chapter 1\n\nA temporary chapter used to verify direct uploads, object hashes and publication.") });
    await page.getByRole("button",{name:"Publish novel",exact:true}).click();
    await expect(page.getByText("Novel published.",{exact:true})).toBeVisible({ timeout:30000 });
    const chapter = await page.request.get(`/api/novels/${slug}/chapter/1`);
    expect(chapter.ok()).toBe(true); expect((await chapter.json()).data.content).toContain("temporary chapter");
    const replay = await page.request.post("/api/novels/upload/complete",{ data:{slug,finalize:true,totalChapters:1} });
    expect(replay.ok()).toBe(true);
    const retryComplete = page.waitForResponse(response => response.url().endsWith("/api/novels/upload/complete") && response.request().method() === "POST");
    await page.getByRole("button",{name:"Publish novel",exact:true}).click();
    expect((await retryComplete).ok()).toBe(true);
    await expect(page.getByText("Novel published.",{exact:true})).toBeVisible();
    expect((await page.request.get(`/api/novels/${slug}/cover`)).ok()).toBe(true);
  } finally {
    // Only this test's UUID-owned document and exact object key are removed.
    await deleteObject(`novels/${slug}/chapters/000001.txt`);
    await deleteObject(`novels/${slug}/cover.png`);
    await conn.collection("hostedchapters").deleteMany({ novelSlug:slug });
    await conn.collection("hostednovels").deleteOne({ slug,addedBy:userId });
    await conn.collection("mediaitems").deleteMany({ user_id:id,hosted_novel_slug:slug });
    await conn.collection("users").updateOne({ _id:id },{ $set:{is_admin:false} });
    await conn.close();
  }
});
