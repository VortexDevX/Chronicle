import { test, expect } from "./session";
import { type Page } from "@playwright/test";
import path from "node:path";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => ({ target: node.target, reason: node.failureSummary })) }));
  });
}

test("theme switching updates artwork and keeps the choice through navigation and reload", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Back to your stories", exact: true })).toHaveAttribute("href", "/home");
  await expect(page.getByRole("link", { name: "Open your library", exact: true })).toHaveAttribute("href", "/library");
  await expect(page.getByRole("link", { name: "Asta", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.getByRole("link", { name: "Ichigo", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Asta", exact: true })).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
  await page.getByRole("link", { name: "Back to your stories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your next chapter." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#19151f");
  await page.screenshot({ path: info.outputPath("home-dusk.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const toggle = page.getByRole("button", { name: "Switch to light mode" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition");
});

test("populated Home separates saved progress, remote releases and weekly activity in both themes", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const now = new Date();
  const featured = {
    _id: "home-feature", title: "Demon Slayer", media_type: "Anime", status: "Active",
    progress_current: 12, progress_total: 26, rating: 9, last_updated: now.toISOString(), custom_cover_url: "/artwork/tanjiro.jpg",
  };
  const release = {
    _id: "home-update", title: "A manhwa with a longer title", media_type: "Manhwa", status: "Active",
    progress_current: 42.5, progress_total: 0, latest_remote_progress: 46, unread_delta: 3.5, last_updated: now.toISOString(),
  };
  const rhythm = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(now.getTime() - (6 - index) * 86_400_000).toISOString().slice(0, 10),
    units: index % 2 ? index : 0,
    events: index % 2 ? index : 0,
  }));
  await page.route("**/api/home", (route) => route.fulfill({ json: { ok: true, data: {
    featured, continue_items: [release, featured], updates: [release], rhythm,
    activity: [{ _id: "activity-fixture", title: release.title, delta: 1.5, occurred_at: now.toISOString() }],
  } } }));
  await page.goto("/home");
  await expect(page.getByRole("progressbar", { name: "Progress for Demon Slayer" })).toHaveAttribute("aria-valuetext", "Ep. 12 / 26");
  await expect(page.getByText("Total not yet known", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "New releases" })).toContainText("+3.5");
  await expect(page.getByRole("region", { name: "Back to your stories" })).toContainText("Ch. 42.5");
  await expect(page.getByRole("region", { name: "A week in stories" })).toContainText(/3\s*active days/);
  await expect(page.getByRole("region", { name: "Recent activity" })).toContainText("+1.5");
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await noOverflow(page);
    expect.soft(await axeViolations(page), theme).toEqual([]);
    await page.screenshot({ path: info.outputPath(`home-journal-${theme}.png`), fullPage: true });
  }
});

test("sidebar hover never introduces horizontal scrolling, expanded or collapsed", async ({ page }, info) => {
  await page.goto("/library");
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu for shelves, graveyard, and settings" }).click();
  }
  const sidebar = page.locator(".sidebar:visible");
  await expect(sidebar).toBeVisible();
  for (const link of await sidebar.locator(".rail-link, .rail-footer-btn").all()) {
    await link.hover();
    expect(await sidebar.evaluate((node) => [node, node.querySelector(".rail-nav")!].every((item) => item.scrollWidth <= item.clientWidth))).toBe(true);
    await noOverflow(page);
  }
  await page.screenshot({ path: info.outputPath("sidebar-hover.png"), fullPage: true });
  if (info.project.name === "desktop") {
    await page.getByRole("button", { name: /Collapse sidebar/ }).click();
    await sidebar.getByRole("link", { name: "Library", exact: true }).hover();
    expect(await sidebar.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
});

test("successful progress gets one brief accent and failed saves get none", async ({ page }, info) => {
  const story = { _id: "motion-fixture", title: "An isolated progress fixture", media_type: "Manhwa", status: "Active", progress_current: 4.5, progress_total: 20, latest_remote_progress: 10, last_updated: "2026-11-18T12:00:00Z", custom_cover_url: "/favicon.png" };
  let fail = false;
  await page.route("**/api/media?*", (route) => {
    if (route.request().method() === "PUT") {
      if (fail) return route.fulfill({ status: 503, json: { error: { message: "Isolated failure" } } });
      story.progress_current = route.request().postDataJSON().progress_current;
      return route.fulfill({ json: { ok: true, data: story } });
    }
    return route.fulfill({ json: { ok: true, data: { items: [story], total: 1, has_more: false } } });
  });
  await page.goto("/library");
  const pixels = () => page.locator("canvas.sakuga-effects").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
  });
  await page.getByRole("button", { name: `Log next for ${story.title}`, exact: true }).click();
  await expect.poll(pixels, { intervals: [10, 20] }).toBe(true);
  await page.screenshot({ path: info.outputPath("saved-accent.png") });
  await expect.poll(pixels).toBe(false);
  fail = true;
  await expect(page.locator(".story-log")).not.toHaveClass(/is-saved/);
  await page.getByRole("button", { name: `Log next for ${story.title}`, exact: true }).click();
  await expect(page.getByText("Not saved. Try +1 again.")).toBeVisible();
  expect(await pixels()).toBe(false);
});

test("motion stays decorative, clears after input and respects saved and system preferences", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/library");
  await page.getByRole("button", { name: "Open profile settings", exact: true }).click();
  const motion = page.getByRole("checkbox", { name: /Interface motion/ });
  await expect(motion).toBeChecked({ timeout: 15000 });
  await expect(page.locator("canvas.sakuga-effects")).toHaveCSS("pointer-events", "none");
  await page.getByRole("tab", { name: "Notifications", exact: true }).click();
  // Navigation and settings changes must remain quiet; no generic click burst.
  expect(await page.locator("canvas.sakuga-effects").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.every((value, index) => index % 4 !== 3 || value === 0);
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("quiet-settings.png") });
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await motion.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.locator("body > canvas.sakuga-effects")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.getByRole("button", { name: "Open profile settings", exact: true }).click();
  await expect(motion).not.toBeChecked();
  await motion.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add new entry", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`public pages, auth modes and missing pages stay accessible in ${theme} mode`, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.context().clearCookies();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("chronicle_theme", theme), theme);
    for (const route of ["/", "/login", "/login?mode=register", "/reset-password", "/download", "/missing-story-page"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await noOverflow(page);
      if (route === "/") await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
      expect.soft(await axeViolations(page), route).toEqual([]);
      await page.screenshot({ path: info.outputPath(`public-${route.replace(/\W/g, "_") || "landing"}.png`), fullPage: true });
    }
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await noOverflow(page);
    expect.soft(await axeViolations(page)).toEqual([]);
  });

  test(`signed-in shell and every settings section pass accessibility checks in ${theme} mode`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("chronicle_theme", theme), theme);
    for (const route of ["/home", "/library", "/updates", "/shelves", "/droppedyard", "/analytics", "/bookmarks", "/cron-history"]) {
      await page.goto(route);
      await expect(page.locator(".page-content")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`shell-${route.slice(1)}.png`), fullPage: true });
      expect.soft(await axeViolations(page), route).toEqual([]);
    }
    await page.getByRole("button", { name: "Open profile settings", exact: true }).click();
    for (const tab of ["Account", "Notifications", "Devices", "Data"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect.soft(await axeViolations(page), tab).toEqual([]);
      await page.screenshot({ path: info.outputPath(`settings-${tab.toLowerCase()}.png`), fullPage: true });
    }
  });
}

test("reader appearance, chapter panel and bookmarks remain usable in every theme", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const novel = { slug: "visual-fixture", title: "An isolated reading fixture", author: "Browser verification", totalChapters: 2, chapters: [{ number: 1, title: "The first chapter" }, { number: 2, title: "The next chapter" }] };
  await page.route("**/api/novels/visual-fixture", (route) => route.fulfill({ json: { ok: true, data: novel } }));
  await page.route("**/api/novels/visual-fixture/chapter/*", (route) => route.fulfill({ json: { ok: true, data: { number: 1, title: "The first chapter", content: "A quiet room, a well-kept page, and somewhere to return.\n\nThis isolated browser fixture checks typography and controls without changing the novel catalogue." } } }));
  await page.route("**/api/reader/preferences", (route) => route.fulfill({ json: { ok: true, data: {} } }));
  await page.goto("/read/visual-fixture/1");
  await expect(page.locator(".reader-content h1")).toBeVisible({ timeout: 15000 });
  for (const theme of ["dark", "light", "night", "amoled"]) {
    await page.getByRole("button", { name: "Reading settings", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.getByLabel("Font size", { exact: true }).fill("24");
    await noOverflow(page);
    expect.soft(await axeViolations(page), `settings-${theme}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`reader-settings-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "Close panel", exact: true }).click();
    expect.soft(await axeViolations(page), `reader-${theme}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`reader-${theme}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Open chapters", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Chapter list" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("reader-chapters.png"), fullPage: true });
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Save selected passage / bookmark" }).click();
  await expect(page.getByRole("dialog", { name: "Save bookmark" })).toBeVisible();
  await page.getByLabel("Passage", { exact: true }).fill("An isolated saved-passage preview.");
  await page.screenshot({ path: info.outputPath("reader-bookmark.png"), fullPage: true });
  await noOverflow(page);
});

test("publishing form previews files and titles without publishing", async ({ page, sessionToken }, info) => {
  const { userId } = jwt.decode(sessionToken) as { userId: string };
  const connection = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  const owner = { _id: new mongoose.Types.ObjectId(userId), username: /^e2e_/ };
  try {
    await connection.collection("users").updateOne(owner, { $set: { is_admin: true } });
    await page.goto("/admin/novels/upload");
    await page.getByLabel("Title", { exact: true }).fill("Isolated upload preview");
    await page.getByLabel("Author", { exact: true }).fill("Browser verification");
    await page.getByLabel("Individual chapters", { exact: true }).setInputFiles({ name: "chapter.txt", mimeType: "text/plain", buffer: Buffer.from("A temporary local preview. This file is never published.") });
    await page.getByLabel("Chapter titles (optional)", { exact: false }).setInputFiles({ name: "titles.txt", mimeType: "text/plain", buffer: Buffer.from("Chapter 1: An opening scene") });
    await expect(page.getByLabel("Chapter 1", { exact: true })).toHaveValue("An opening scene");
    await expect(page.getByRole("button", { name: "Publish novel", exact: true })).toBeEnabled();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await noOverflow(page);
    expect.soft(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath("publishing-desk.png"), fullPage: true });
  } finally {
    await connection.collection("users").updateOne(owner, { $set: { is_admin: false } });
    await connection.close();
  }
});

test("populated library, filters, details and entry forms use accessible surfaces", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const story = { _id: "surface-fixture", title: "An isolated library fixture", media_type: "Manhwa", status: "Active", progress_current: 42.5, progress_total: 70, latest_remote_progress: 46, last_updated: "2026-11-18T12:00:00Z", custom_cover_url: "/favicon.png", rating: 8, notes: "Visual verification only." };
  await page.route("**/api/media?*", (route) => route.fulfill({ json: { ok: true, data: { items: [story], total: 1, has_more: false } } }));
  await page.goto("/library");
  const cover = page.getByRole("button", { name: `View details for ${story.title}`, exact: true });
  await expect(cover).toBeVisible({ timeout: 15000 });
  expect.soft(await axeViolations(page), "populated library").toEqual([]);
  await page.screenshot({ path: info.outputPath("populated-library.png"), fullPage: true });
  await page.locator(".library-filter-disclosure>summary").click();
  expect.soft(await axeViolations(page), "filters").toEqual([]);
  await page.locator(".library-filter-disclosure>summary").click();
  await cover.click();
  await expect(page.getByRole("dialog", { name: story.title })).toBeVisible();
  expect.soft(await axeViolations(page), "story details").toEqual([]);
  await page.screenshot({ path: info.outputPath("story-details.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add new entry", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add Entry", exact: true })).toBeVisible();
  expect.soft(await axeViolations(page), "entry form").toEqual([]);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("entry-form.png"), fullPage: true });
});

test("novel catalogue and populated detail retain chapter and description controls", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const novel = { slug: "visual-fixture", title: "An isolated novel fixture", author: "Browser verification", description: "An isolated visual fixture for the catalogue, reading progress, and chapter list.", genres: ["Fantasy", "Adventure"], status: "ongoing", totalChapters: 2, cover: "/icon.png", library: { status: "Active", progress_current: 1, is_favorite: false }, chapters: [{ number: 1, title: "The first chapter" }, { number: 2, title: "The next chapter" }] };
  await page.route("**/api/novels?all=1", (route) => route.fulfill({ json: { ok: true, data: { items: [novel], genres: novel.genres, total: 1, has_more: false, is_admin: false } } }));
  await page.route("**/api/novels/visual-fixture", (route) => route.fulfill({ json: { ok: true, data: novel } }));
  await page.goto("/novels");
  await expect(page.locator(".nocturne-novel-card")).toBeVisible({ timeout: 15000 });
  expect.soft(await axeViolations(page), "novel catalogue").toEqual([]);
  await page.screenshot({ path: info.outputPath("novel-catalogue.png"), fullPage: true });
  await page.goto("/novels/visual-fixture");
  await expect(page.locator(".novel-detail-copy h1")).toBeVisible({ timeout: 15000 });
  expect.soft(await axeViolations(page), "novel chapters").toEqual([]);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("novel-detail.png"), fullPage: true });
  await page.getByRole("button", { name: "Details", exact: true }).click();
  expect.soft(await axeViolations(page), "novel description").toEqual([]);
});
