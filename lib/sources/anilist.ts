import { logInfo, logInternalError } from "@/lib/log";

export type AniListTitle = {
  english: string | null;
  romaji: string | null;
  native: string | null;
};

export type AniListMedia = {
  id: number;
  title: AniListTitle;
  countryOfOrigin: string | null; // "JP", "CN", "KR"
  format: string | null;
  status: string;
  episodes: number | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  } | null;
};

export type AniListSearchResult = {
  anilistId: number;
  title: string;
  subtitle: string | null;
  format: string | null;
  countryOfOrigin: string | null;
  totalEpisodes: number | null;
  posterUrl: string | null;
  status: string;
};

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";

function getMaxRequestsPerMinute(): number {
  const envVal = Number(process.env.ANILIST_RATE_LIMIT_PER_MINUTE || 25);
  return Number.isFinite(envVal) ? Math.min(30, Math.max(10, Math.floor(envVal))) : 25;
}

const requestTimestamps: number[] = [];
let rateLimitResetEpochSeconds = 0;
let remainingAllowedRequests: number | null = null;
let apiUnavailableUntil = 0;
const API_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000;

type CachedEntry = {
  data: AniListMedia;
  expiresAt: number;
};
const mediaCache = new Map<number, CachedEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function clearAniListCache(): void {
  mediaCache.clear();
  requestTimestamps.length = 0;
  rateLimitResetEpochSeconds = 0;
  remainingAllowedRequests = null;
  apiUnavailableUntil = 0;
}

export function getDisplayTitle(title: AniListTitle): { main: string; sub: string | null } {
  const english = title.english?.trim();
  const romaji = title.romaji?.trim();
  const native = title.native?.trim();

  if (english) {
    return { main: english, sub: romaji || native || null };
  }
  if (romaji) {
    return { main: romaji, sub: native || null };
  }
  return { main: native || "Untitled", sub: null };
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const maxPerMinute = getMaxRequestsPerMinute();

  if (rateLimitResetEpochSeconds > 0) {
    const waitMs = rateLimitResetEpochSeconds * 1000 - now;
    if (waitMs > 0 && waitMs < 60_000) {
      await new Promise((resolve) => setTimeout(resolve, waitMs + 250));
    }
    rateLimitResetEpochSeconds = 0;
  }

  const oneMinuteAgo = now - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= maxPerMinute || remainingAllowedRequests === 0) {
    const oldest = requestTimestamps[0] || now;
    const waitMs = Math.max(500, oldest + 60_000 - now + 250);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(Date.now());
}

function handleResponseHeaders(res: Response): void {
  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  const resetHeader = res.headers.get("x-ratelimit-reset");
  const retryAfterHeader = res.headers.get("retry-after");

  if (remainingHeader !== null) {
    const remaining = parseInt(remainingHeader, 10);
    if (Number.isFinite(remaining)) remainingAllowedRequests = remaining;
  }

  if (retryAfterHeader !== null) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      rateLimitResetEpochSeconds = Math.floor(Date.now() / 1000) + seconds;
    }
  } else if (resetHeader !== null) {
    const epoch = parseInt(resetHeader, 10);
    if (Number.isFinite(epoch) && epoch > 0) {
      rateLimitResetEpochSeconds = epoch;
    }
  }
}

async function executeAniListGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  retries = 2,
): Promise<T | null> {
  if (Date.now() < apiUnavailableUntil) return null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (Date.now() < apiUnavailableUntil) return null;

    try {
      await enforceRateLimit();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Chronicle/1.0",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      handleResponseHeaders(res);

      if (res.status === 429) {
        logInfo("anilist_rate_limit_exceeded", { attempt, resetEpoch: rateLimitResetEpochSeconds });
        if (attempt < retries) {
          const delay = rateLimitResetEpochSeconds > 0
            ? Math.max(1000, rateLimitResetEpochSeconds * 1000 - Date.now() + 500)
            : 1500 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
          continue;
        }
        return null;
      }

      if (res.status >= 500) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        apiUnavailableUntil = Date.now() + API_UNAVAILABLE_COOLDOWN_MS;
        return null;
      }

      if (!res.ok) {
        return null;
      }

      const json = await res.json();
      return json.data as T;
    } catch (err: unknown) {
      if (attempt >= retries) {
        logInternalError("anilist_graphql_request_failed", err, { attempt });
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }

  return null;
}

const MEDIA_BY_ID_QUERY = `
query MediaById($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    title {
      english
      romaji
      native
    }
    countryOfOrigin
    format
    status
    episodes
    coverImage {
      extraLarge
      large
      medium
    }
  }
}
`;

export async function fetchAniListMediaById(id: number): Promise<AniListMedia | null> {
  if (!Number.isInteger(id) || id <= 0) return null;

  const now = Date.now();
  const cached = mediaCache.get(id);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const data = await executeAniListGraphQL<{ Media?: AniListMedia }>(
    MEDIA_BY_ID_QUERY,
    { id },
  );

  if (data?.Media) {
    mediaCache.set(id, { data: data.Media, expiresAt: now + CACHE_TTL_MS });
    return data.Media;
  }

  return null;
}

const SEARCH_MEDIA_QUERY = `
query SearchMedia($query: String!, $country: CountryCode, $limit: Int) {
  Page(page: 1, perPage: $limit) {
    media(search: $query, type: ANIME, countryOfOrigin: $country) {
      id
      title {
        english
        romaji
        native
      }
      countryOfOrigin
      format
      status
      episodes
      coverImage {
        extraLarge
        large
        medium
      }
    }
  }
}
`;

/**
 * Searches AniList titles for matching anime or donghua.
 */
export async function searchAniListMedia(
  query: string,
  options: { countryOfOrigin?: "JP" | "CN"; limit?: number } = {},
): Promise<AniListSearchResult[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  const limit = Math.min(20, Math.max(1, options.limit || 10));
  const data = await executeAniListGraphQL<{ Page?: { media?: AniListMedia[] } }>(
    SEARCH_MEDIA_QUERY,
    {
      query: clean,
      country: options.countryOfOrigin || undefined,
      limit,
    },
  );

  const list = data?.Page?.media || [];
  return list.map((item) => {
    const { main, sub } = getDisplayTitle(item.title);
    return {
      anilistId: item.id,
      title: main,
      subtitle: sub,
      format: item.format,
      countryOfOrigin: item.countryOfOrigin,
      totalEpisodes: item.episodes,
      posterUrl: item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || null,
      status: item.status,
    };
  });
}
