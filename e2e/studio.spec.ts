import { test, expect } from "./session";

test("mobile update delta stays compact and navigation drawer aligns left", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Mobile layout regression");
  await page.route("**/api/updates", (route) => route.fulfill({ json: { ok: true, data: {
    items: [{
      _id: "mobile-layout-story", title: "Mobile layout story", media_type: "Manhwa", status: "Active",
      progress_current: 19, progress_total: 0, latest_remote_progress: 20, unread_delta: 1,
      telegram_state: "not_notified", last_updated: "2026-11-05T12:00:00.000Z", last_checked_at: "2026-11-05T12:00:00.000Z",
    }],
    tracker_errors: [], partial_failures: [],
  } } }));
  await page.goto("/updates");
  const delta = page.locator(".update-delta");
  await expect(delta).toContainText("+1");
  const deltaBox = await delta.boundingBox();
  const mainBox = await page.locator(".update-row-main").boundingBox();
  expect(deltaBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(deltaBox!.width).toBeLessThan(mainBox!.width / 2);

  await page.getByRole("button", { name: "Open menu for shelves, graveyard, and settings" }).click();
  const drawer = page.locator(".navigation-dialog .sidebar.app-rail");
  await expect(drawer).toBeVisible();
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox).not.toBeNull();
  expect(drawerBox!.x).toBe(0);
  expect(drawerBox!.width).toBeLessThanOrEqual(300);
  await page.screenshot({ path: info.outputPath("mobile-updates-and-drawer.png"), fullPage: true, animations: "disabled" });
});

test("studio surfaces keep the same design and fit desktop and mobile", async ({ page }, info) => {
  test.setTimeout(120000);
  for (const path of ["/home","/library","/novels","/shelves","/updates","/analytics","/bookmarks","/droppedyard","/cron-history"]) {
    await page.goto(path);
    await expect(page.locator(".page-content")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),path).toBe(true);
    expect(await page.locator(".main").evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(16, 19, 27)");
    await page.screenshot({ path:info.outputPath(`${path.slice(1)}.png`),fullPage:true,animations:"disabled" });
  }
  await page.getByRole("button",{name:"Open profile settings",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Your account",exact:true})).toBeVisible();
  await expect(page.locator(".avatar-upload-control")).toBeVisible();
  const centered = await page.locator(".settings-modal").evaluate(node => {
    const box=node.getBoundingClientRect(); const viewport=window.visualViewport;
    return Math.abs(box.x+box.width/2-innerWidth/2)<2 && Math.abs(box.y+box.height/2-((viewport?.offsetTop||0)+(viewport?.height||innerHeight)/2))<2;
  });
  expect(centered).toBe(true);
  await page.screenshot({path:info.outputPath("settings.png"),fullPage:true,animations:"disabled"});
  await page.getByRole("tab",{name:"Notifications",exact:true}).click();
  await page.screenshot({path:info.outputPath("notifications.png"),fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"Close settings",exact:true}).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.context().clearCookies();
  for (const path of ["/","/login","/download"]) {
    await page.goto(path); await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),path).toBe(true);
    await page.screenshot({path:info.outputPath(path === "/" ? "landing.png" : `${path.slice(1)}.png`),fullPage:true});
  }
});
