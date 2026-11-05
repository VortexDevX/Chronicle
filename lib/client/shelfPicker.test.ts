import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearShelfPicker, loadShelfPicker } from "./shelfPicker";
const items = [{_id:"shelf",name:"Favorites",media_ids:["entry"]}];
beforeEach(() => clearShelfPicker());
afterEach(() => vi.unstubAllGlobals());
it("shares the warmed request across form openings", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,data:{items}})));
  vi.stubGlobal("fetch",fetcher);
  expect(await Promise.all([loadShelfPicker(),loadShelfPicker()])).toEqual([items,items]);
  expect(await loadShelfPicker()).toEqual(items);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not retain failed shelf loads", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}",{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({data:{items}})));
  vi.stubGlobal("fetch",fetcher);
  await expect(loadShelfPicker()).rejects.toThrow();
  expect(await loadShelfPicker()).toEqual(items);
});
it("clearing a session prevents its in-flight response from populating the next session", async () => {
  let release!:(value:Response)=>void;
  const fetcher=vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {release=resolve;})).mockResolvedValue(new Response(JSON.stringify({data:{items:[]}})));
  vi.stubGlobal("fetch",fetcher);
  const old=loadShelfPicker(); clearShelfPicker();
  release(new Response(JSON.stringify({data:{items}}))); await old;
  expect(await loadShelfPicker()).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
