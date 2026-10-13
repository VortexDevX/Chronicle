import { logInfo, logInternalError } from "@/lib/log";

export type AiringScheduleState =
  | "SCHEDULED"
  | "SCHEDULE_PENDING"
  | "HIATUS"
  | "CONCLUDED";

export type AniListTitle = {
  english: string | null;
  romaji: string | null;
  native: string | null;
};

export type AniListMedia = {
  id: number;
  title: AniListTitle;
  countryOfOrigin: string | null; // "JP", "CN", "KR"
  format: string | null; // "TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "NOVEL", "MANGA"
  status: "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
  episodes: number | null;
  nextAiringEpisode: {
    episode: number;
    airingAt: number; // Unix epoch seconds
    timeUntilAiring: number;
  } | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
  } | null;
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        episodes: number | null;
        title: { english: string | null; romaji: string | null };
      };
    }>;
  };
};

export type AniListScheduleResult = {
  anilistId: number;
  state: AiringScheduleState;
  nextEpisode: number | null;
  nextReleaseAt: Date | null;
  totalEpisodes: number | null;
  status: AniListMedia["status"];
  title: string;
  subtitle: string | null;
  posterUrl: string | null;
  episodeUrl?: string | null;
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

// Configurable conservative rate limit (default 25 req/min, capped between 10 and 30)
function getMaxRequestsPerMinute(): number {
  const envVal = Number(process.env.ANILIST_RATE_LIMIT_PER_MINUTE || 25);
  return Number.isFinite(envVal) ? Math.min(30, Math.max(10, Math.floor(envVal))) : 25;
}

const requestTimestamps: number[] = [];
let rateLimitResetEpochSeconds = 0;
let remainingAllowedRequests: number | null = null;

// Cache map with timestamp
type CachedEntry = {
  data: AniListMedia;
  expiresAt: number;
};
const mediaCache = new Map<number, CachedEntry>();

const TTL_ACTIVE_MS = 4 * 60 * 60 * 1000; // 4 hours
const TTL_PENDING_MS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_CONCLUDED_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getTtlForMedia(media: AniListMedia): number {
  if (media.status === "FINISHED" || media.status === "CANCELLED") {
    return TTL_CONCLUDED_MS;
  }
  if (media.status === "HIATUS" || !media.nextAiringEpisode) {
    return TTL_PENDING_MS;
  }
  return TTL_ACTIVE_MS;
}

export function clearAniListCache(): void {
  mediaCache.clear();
  requestTimestamps.length = 0;
  rateLimitResetEpochSeconds = 0;
  remainingAllowedRequests = null;
}

export function deriveScheduleState(media: AniListMedia): AiringScheduleState {
  if (media.status === "FINISHED" || media.status === "CANCELLED") {
    return "CONCLUDED";
  }
  if (media.status === "HIATUS") {
    return "HIATUS";
  }
  if (media.nextAiringEpisode && media.nextAiringEpisode.airingAt > 0) {
    return "SCHEDULED";
  }
  return "SCHEDULE_PENDING";
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

  // If previous response instructed a Retry-After / Reset epoch, wait if needed
  if (rateLimitResetEpochSeconds > 0) {
    const waitMs = rateLimitResetEpochSeconds * 1000 - now;
    if (waitMs > 0 && waitMs < 60_000) {
      await new Promise((resolve) => setTimeout(resolve, waitMs + 250));
    }
    rateLimitResetEpochSeconds = 0;
  }

  // Purge timestamps older than 60 seconds
  const oneMinuteAgo = now - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
  }

  // If local window is full or headers reported remaining === 0
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    await enforceRateLimit();

    try {
      const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Chronicle/1.0",
        },
        body: JSON.stringify({ query, variables }),
      });

      handleResponseHeaders(res);

      if (res.status === 429) {
        logInfo("anilist_rate_limit_exceeded", {
          attempt,
          resetEpoch: rateLimitResetEpochSeconds,
        });
        if (attempt < retries) {
          const jitter = Math.floor(Math.random() * 500);
          const delay = (rateLimitResetEpochSeconds > 0
            ? Math.max(1000, rateLimitResetEpochSeconds * 1000 - Date.now())
            : 3000 * (attempt + 1)) + jitter;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      if (!res.ok) {
        logInfo("anilist_request_failed", { status: res.status, statusText: res.statusText });
        if (attempt < retries && res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return null;
      }

      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors && json.errors.length > 0) {
        logInfo("anilist_graphql_errors", { errors: json.errors.map((e) => e.message).join("; ") });
      }
      return json.data || null;
    } catch (err) {
      if (attempt === retries) {
        logInternalError("anilist_graphql_exception", err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

const BATCH_MEDIA_QUERY = `
query GetAiringBatch($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
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
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
      coverImage {
        extraLarge
        large
        medium
      }
      relations {
        edges {
          relationType
          node {
            id
            episodes
            title {
              english
              romaji
            }
          }
        }
      }
    }
  }
}
`;

/**
 * Fetch media details and upcoming airing schedule for a batch of AniList IDs (up to 50 per request).
 * Uses in-memory TTL caching so repeated checks within hours do not make network calls.
 */
export async function fetchAniListMediaBatch(ids: number[]): Promise<Map<number, AniListMedia>> {
  const result = new Map<number, AniListMedia>();
  const validIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (validIds.length === 0) return result;

  const now = Date.now();
  const idsToFetch: number[] = [];

  for (const id of validIds) {
    const cached = mediaCache.get(id);
    if (cached && cached.expiresAt > now) {
      result.set(id, cached.data);
    } else {
      idsToFetch.push(id);
    }
  }

  if (idsToFetch.length === 0) {
    return result;
  }

  // Chunk in batches of 50
  for (let i = 0; i < idsToFetch.length; i += 50) {
    const chunk = idsToFetch.slice(i, i + 50);
    const data = await executeAniListGraphQL<{ Page?: { media?: AniListMedia[] } }>(
      BATCH_MEDIA_QUERY,
      { ids: chunk },
    );

    const mediaList = data?.Page?.media || [];
    for (const media of mediaList) {
      const ttl = getTtlForMedia(media);
      mediaCache.set(media.id, { data: media, expiresAt: now + ttl });
      result.set(media.id, media);
    }
  }

  return result;
}

export async function fetchAniListMediaById(id: number): Promise<AniListMedia | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const batch = await fetchAniListMediaBatch([id]);
  return batch.get(id) || null;
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
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
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
      posterUrl: item.coverImage?.large || item.coverImage?.extraLarge || null,
      status: item.status,
    };
  });
}

/**
 * Converts AniList media into a uniform schedule model for Release Radar and chapter checks.
 */
export function formatAniListSchedule(media: AniListMedia): AniListScheduleResult {
  const state = deriveScheduleState(media);
  const { main, sub } = getDisplayTitle(media.title);
  const nextReleaseAt = media.nextAiringEpisode?.airingAt
    ? new Date(media.nextAiringEpisode.airingAt * 1000)
    : null;

  return {
    anilistId: media.id,
    state,
    nextEpisode: media.nextAiringEpisode?.episode ?? null,
    nextReleaseAt,
    totalEpisodes: media.episodes,
    status: media.status,
    title: main,
    subtitle: sub,
    posterUrl: media.coverImage?.large || media.coverImage?.extraLarge || null,
    episodeUrl: `https://anilist.co/anime/${media.id}`,
  };
}
