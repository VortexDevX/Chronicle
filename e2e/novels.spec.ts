import { test, expect } from "./session";

test("novel filters update locally without reloading the archive", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/novels?all=1", (route) => {
    requests++;
    return route.fulfill({ json: { ok: true, data: {
      items: [
        { slug:"ongoing-story",title:"Ongoing Story",author:"Author A",description:"",genres:["Fantasy"],status:"ongoing",totalChapters:20,cover:null,library:null,createdAt:"2026-11-01T00:00:00Z" },
        { slug:"finished-story",title:"Finished Story",author:"Author B",description:"",genres:["Mystery"],status:"completed",totalChapters:10,cover:null,library:null,createdAt:"2026-11-02T00:00:00Z" },
      ],
      genres:["Fantasy","Mystery"],total:2,has_more:false,is_admin:false,
    } } });
  });
  await page.goto("/novels");
  await expect(page.getByRole("link",{name:"Ongoing Story",exact:true}).last()).toBeVisible();
  const initialRequests = requests;
  await page.getByRole("button",{name:"Completed",exact:true}).click();
  await expect(page.getByRole("link",{name:"Finished Story",exact:true}).last()).toBeVisible();
  await expect(page.getByRole("link",{name:"Ongoing Story",exact:true})).toHaveCount(0);
  await expect(page.locator(".novel-loading")).toHaveCount(0);
  await page.getByRole("button",{name:"Fantasy",exact:true}).click();
  await expect(page.getByText("No novels found",{exact:true})).toBeVisible();
  expect(initialRequests).toBeGreaterThan(0);
  expect(requests).toBe(initialRequests);
});

test("profile avatar keeps a circular crop with a loaded image", async ({ page }, info) => {
  await page.route("**/api/profile", async route => {
    const response = await route.fetch(); const json = await response.json();
    await route.fulfill({ response, json: { ...json, data:{ ...json.data, avatar_url:"/icon.png" } } });
  });
  await page.goto("/novels");
  if (info.project.name === "mobile") {
    await page.getByRole("button",{name:"Open menu for shelves, graveyard, and settings"}).click();
    await page.getByRole("button",{name:"Settings",exact:true}).click();
  }
  const frame = page.locator(info.project.name === "mobile" ? ".avatar-editor>.profile-avatar" : ".topbar-user-chip");
  const image = frame.locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const shape = await frame.evaluate(node => ({ width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,radius:getComputedStyle(node).borderRadius }));
  expect(shape.width).toBe(shape.height); expect(shape.radius).toBe("50%");
  expect(await image.evaluate(node => getComputedStyle(node).objectFit)).toBe("cover");
  await page.screenshot({ path:info.outputPath("avatar.png"),fullPage:true });
});
test("signed-out novel pages redirect and private APIs reject", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/novels");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/novels")).status()).toBe(401);
  expect((await page.request.post("/api/novels/upload/prepare", { data:{} })).status()).toBe(401);
});
test("reader writes only on chapter open, supports themes and saved passages", async ({ page }, info) => {
  let writes = 0; let bookmark: Record<string,unknown> = {};
  await page.route("**/api/novels/demo/chapter/*", async route => {
    const number = Number(new URL(route.request().url()).pathname.split("/").pop());
    if (route.request().method() === "POST") { writes++; return route.fulfill({ json:{ ok:true,data:{ status:"Active",progress_current:number } } }); }
    return route.fulfill({ json:{ ok:true,data:{ number,title:`The quiet chapter ${number}`,content:"The archive keeps its stories safe.\n\nA second paragraph, with a passage worth keeping." } } });
  });
  await page.route("**/api/novels/demo", route => route.fulfill({ json:{ ok:true,data:{ slug:"demo",title:"The Quiet Archive",author:"Example Author",totalChapters:201,chapters:[{number:199,title:"Before"},{number:200,title:"The quiet chapter"},{number:201,title:"After"}] } } }));
  await page.route("**/api/reader/preferences", route => route.fulfill({ json:{ ok:true,data:{} } }));
  await page.route("**/api/bookmarks", route => { bookmark = route.request().postDataJSON(); return route.fulfill({ json:{ ok:true,data:{} } }); });
  await page.goto("/read/demo/200");
  await expect(page.getByRole("heading",{name:"The quiet chapter 200"})).toBeVisible();
  await expect.poll(() => writes).toBe(1);
  await page.clock.install(); await page.clock.runFor(60000);
  expect(writes).toBe(1);
  await page.getByRole("button",{name:"Reading settings",exact:true}).click();
  await page.getByLabel("Theme",{exact:true}).selectOption("light");
  await expect(page.locator(".novel-reader")).toHaveAttribute("data-theme","light");
  await page.getByLabel("Reading font",{exact:true}).selectOption("literata");
  await expect(page.locator(".reader-paragraph").first()).toHaveCSS("font-family",/Literata/i);
  await page.getByRole("tab",{name:"Reading",exact:true}).click();
  await page.getByLabel("Reading mode").selectOption("paged");
  await page.getByRole("button",{name:"Close panel",exact:true}).click();
  await page.getByRole("button",{name:"Save selected passage / bookmark"}).click();
  await page.getByLabel("Passage",{exact:true}).fill("A passage worth keeping.");
  await page.getByLabel("Note",{exact:true}).fill("My note");
  await page.getByRole("button",{name:"Save bookmark",exact:true}).click();
  await expect(page.getByText("Passage saved.")).toBeVisible();
  expect(bookmark).toMatchObject({ novel_slug:"demo",chapter:200,note:"My note" });
  await page.getByRole("button",{name:"Enter focus mode",exact:true}).click();
  await expect(page.locator(".reader-toolbar")).not.toBeVisible();
  await expect(page.locator(".reader-footer")).not.toBeVisible();
  await page.getByRole("button",{name:"Exit focus mode",exact:true}).click();
  await expect(page.locator(".reader-toolbar")).toBeVisible();
  expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path:info.outputPath("reader.png"),fullPage:true });
});
test("regular users cannot upload or change administrator privileges", async ({ page }) => {
  expect((await page.request.post("/api/novels/upload/prepare",{ data:{title:"Denied"} })).status()).toBe(403);
  await page.goto("/admin/novels/upload");
  await expect(page).toHaveURL(/\/novels$/);
  const result = await page.request.put("/api/profile", { data:{ is_admin:true } });
  expect(result.status()).toBe(400);
});
