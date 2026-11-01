import { test, expect, type Page } from "@playwright/test";

const story = {
  _id: "story-1", title: "A Story With a Long and Memorable Title", media_type: "Manhwa", status: "Active",
  progress_current: 42.5, progress_total: 0, latest_remote_progress: 45, last_updated: "2026-10-31T12:00:00Z", custom_cover_url: "/favicon.png",
};

async function mockLibrary(page: Page) {
  // Deliberately contain all data and all mutations inside the browser test.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return route.fulfill({ status: 503, json: { error: { message: "Simulated save failure" } } });
    let data: unknown = {};
    if (url.pathname === "/api/auth") data = { loggedIn: true, username: "Reader" };
    else if (url.pathname === "/api/media") data = { items: url.searchParams.get("search") ? [] : [story], total: url.searchParams.get("search") ? 0 : 1, has_more: false };
    else if (url.pathname === "/api/profile") data = { email: "reader@example.test", notifications_enabled: false, push_notifications_enabled: false };
    else data = { items: [], total: 0 };
    return route.fulfill({ json: { ok: true, data } });
  });
  await page.goto("/library");
  await expect(page.getByRole("button", { name: `View details for ${story.title}` })).toBeVisible();
}

test.beforeEach(async ({ page }) => { await mockLibrary(page); });

test("failed save restores fractional progress and never announces saved", async ({ page }) => {
  await page.getByRole("button", { name: `Log next for ${story.title}`, exact: true }).click();
  await expect(page.getByText("Not saved. Try +1 again.")).toBeVisible();
  await expect(page.locator(".story-progress strong")).toHaveText("Ch. 42.5");
  await expect(page.locator(".story-log")).not.toHaveClass(/is-saved/);
});

test("mobile and desktop list retain progress without inventing completion", async ({ page }) => {
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".story-progress strong")).toBeVisible();
  await expect(page.locator(".story-progress strong")).toHaveText("Ch. 42.5");
  await expect(page.locator(".story-availability")).toHaveText("2.5 chapters unread · latest 45");
  await expect(page.getByText("100% complete", { exact: true })).toHaveCount(0);
});

test("cover opens details in one tap and closing returns focus", async ({ page }) => {
  const opener = page.getByRole("button", { name: `View details for ${story.title}` });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: story.title });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("entry dialog contains keyboard focus and protects unsaved edits", async ({ page }) => {
  await page.getByRole("button", { name: "Add new entry", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Entry", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Add entry", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await dialog.getByLabel("Title", { exact: true }).fill("Unsaved story");
  await page.keyboard.press("Escape");
  const confirmation = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Unsaved story");
});

test("empty search offers reset instead of first-entry onboarding", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search your library" }).fill("No match");
  await expect(page.getByRole("heading", { name: "No matching stories" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search & filters" }).click();
  await expect(page.locator(".media-card")).toHaveCount(1);
});

test("selection and filters stay usable without floating add overlap", async ({ page }) => {
  await page.getByRole("button", { name: "Select multiple entries" }).click();
  await page.getByRole("button", { name: `Select ${story.title}`, exact: true }).click();
  await expect(page.getByText("of 1 shown selected")).toBeVisible();
  await expect(page.locator(".btn-fab:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel selection" }).click();
  await page.locator(".library-filter-disclosure summary").click();
  await expect(page.getByLabel("Format", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Sort by", { exact: true })).toBeVisible();
});

test("reduced motion removes collection entrance effects", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".media-card").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("home jacket and recent queue preserve progress when saves fail", async ({ page }) => {
  const recent = { ...story, _id: "story-2", title: "Another active story", progress_current: 18.5 };
  await page.route("**/api/home", (route) => route.fulfill({ json: { ok: true, data: {
    featured: story, continue_items: [story, recent], updates: [], activity: [], rhythm: [], partial_failures: [],
  } } }));
  await page.goto("/home");
  await expect(page.locator(".home-hero").getByRole("button", { name: `View details for ${story.title}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log Ch 43.5", exact: true }).click();
  await expect(page.locator(".hero-progress > strong")).toHaveText("Ch. 42.5");
  await expect(page.locator(".hero-primary")).toBeEnabled();
  await expect(page.locator(".hero-primary .lucide-check")).toHaveCount(0);
  await page.getByRole("button", { name: `Log next for ${recent.title}`, exact: true }).click();
  await expect(page.locator(".queue-row").filter({ hasText: recent.title }).locator(".queue-copy p")).toHaveText("Ch. 18.5");
  await expect(page.locator(".queue-row").filter({ hasText: recent.title }).locator(".queue-log")).toBeEnabled();
  await expect(page.getByText("Simulated save failure").first()).toBeVisible();
});

test("featured stories rotate every five seconds, loop, and keep the recent queue stable", async ({ page }) => {
  const now = new Date("2026-10-31T12:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  const second = { ...story, _id: "second", title: "Second featured story", progress_current: 18.5 };
  const third = { ...story, _id: "third", title: "Third featured story", progress_current: 7 };
  let requests = 0;
  await page.route("**/api/home", (route) => {
    requests++;
    return route.fulfill({ json: { ok: true, data: { featured: story, featured_items: [story, second, third], continue_items: [third, story], updates: [], activity: [], rhythm: [] } } });
  });
  await page.goto("/home");
  const heading = page.locator(".current-volume-copy h2");
  const queue = page.locator(".queue-copy h3");
  await expect(heading).toHaveText(story.title);
  await page.clock.runFor(4999);
  await expect(heading).toHaveText(story.title);
  await page.clock.runFor(1);
  await expect(heading).toHaveText(second.title);
  await expect(page.locator(".hero-progress > strong")).toHaveText("Ch. 18.5");
  await page.clock.runFor(5000);
  await expect(heading).toHaveText(third.title);
  await page.clock.runFor(5000);
  await expect(heading).toHaveText(story.title);
  await expect(queue).toHaveText([third.title, story.title]);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Pause featured rotation" }).click();
  await page.clock.runFor(15000);
  await expect(heading).toHaveText(story.title);
  await page.getByRole("button", { name: "Resume featured rotation" }).click();
  await page.clock.runFor(5000);
  await expect(heading).toHaveText(second.title);
});

test("rotated story saves target the visible title and retain its progress after failure", async ({ page }) => {
  const now = new Date("2026-10-31T12:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  const second = { ...story, _id: "second", title: "Second featured story", progress_current: 18.5 };
  await page.route("**/api/home", (route) => route.fulfill({ json: { ok: true, data: {
    featured: story, featured_items: [story, second], continue_items: [story], updates: [], activity: [], rhythm: [],
  } } }));
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  let savedRequest: { id: string | null; progress: number } | undefined;
  await page.route("**/api/media?*", async (route) => {
    savedRequest = { id: new URL(route.request().url()).searchParams.get("id"), progress: route.request().postDataJSON().progress_current };
    await pendingSave;
    await route.fulfill({ status: 503, json: { error: { message: "Simulated save failure" } } });
  });
  await page.goto("/home");
  await expect(page.locator(".current-volume-copy h2")).toHaveText(story.title);
  await page.clock.runFor(5000);
  await expect(page.locator(".current-volume-copy h2")).toHaveText(second.title);
  await page.getByRole("button", { name: "Log Ch 19.5", exact: true }).click();
  await expect.poll(() => savedRequest).toEqual({ id: "second", progress: 19.5 });
  await page.clock.runFor(15000);
  await expect(page.locator(".current-volume-copy h2")).toHaveText(second.title);
  releaseSave();
  await expect(page.locator(".hero-progress > strong")).toHaveText("Ch. 18.5");
  await page.getByRole("button", { name: "Resume featured rotation" }).click();
  await page.clock.runFor(5000);
  await expect(page.locator(".current-volume-copy h2")).toHaveText(story.title);
  await expect(page.locator(".hero-progress > strong")).toHaveText("Ch. 42.5");
});

test("settings sections and notification toggles support keyboard access", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open menu for shelves, graveyard, and settings" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  } else await page.getByRole("button", { name: "Open profile settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Notifications", exact: true }).click();
  const toggle = dialog.getByRole("checkbox", { name: /Android Push Notifications/ });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await page.keyboard.press("Escape");
  const confirmation = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog).toHaveCount(0);
});

test("signed-out library redirects to accessible sign-in form", async ({ page }) => {
  await page.route("**/api/auth", (route) => route.fulfill({ status: 401, json: { error: { message: "Unauthorized" } } }));
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
});
