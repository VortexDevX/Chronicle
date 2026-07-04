const EXPORT_PAGE_SIZE = 100;

type FetchLike = typeof fetch;

type MediaListResponse = {
  ok?: boolean;
  data?: {
    items?: unknown[];
    has_more?: boolean;
    page?: number;
  };
};

export async function fetchAllMediaForExport(
  fetcher: FetchLike = fetch,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(EXPORT_PAGE_SIZE),
      sort_by: "last_updated",
    });
    const res = await fetcher(`/api/media?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error("Export failed");
    }

    const json = (await res.json()) as MediaListResponse;
    const pageItems = Array.isArray(json.data?.items) ? json.data.items : [];
    items.push(...pageItems);

    hasMore = Boolean(json.data?.has_more);
    page += 1;
  }

  return items;
}
