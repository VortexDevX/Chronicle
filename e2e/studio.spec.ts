import { test, expect } from "./session";

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
