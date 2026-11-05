import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ apiRequest:vi.fn() }));
import { apiRequest } from "./api";
import { importMediaBackup } from "./backup";
describe("hosted novel backup restoration", () => {
  beforeEach(() => vi.clearAllMocks());
  it("restores a hosted link through the catalogue and preserves manual chapter count", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({library:null}).mockResolvedValueOnce({_id:"entry"}).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const file = new File([JSON.stringify([{hosted_novel_slug:"example",status:"Active",progress_current:200,is_favorite:true}])],"library.json");
    expect(await importMediaBackup(file)).toEqual({inserted:1,skipped:0});
    expect(apiRequest).toHaveBeenCalledWith("/api/novels/example/library",{method:"POST"});
    expect(apiRequest).toHaveBeenCalledWith("/api/media?id=entry",expect.objectContaining({method:"PUT",body:JSON.stringify({status:"Active",progress_current:200})}));
  });
  it("does not overwrite a newer existing library entry", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({library:{progress_current:300}});
    const file = new File([JSON.stringify([{hosted_novel_slug:"example",progress_current:200}])],"library.json");
    expect(await importMediaBackup(file)).toEqual({inserted:0,skipped:1});
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
