export type SimklCalendarEntry = {
  simkl_id: number;
  date: string;
  finale_type: 1 | 2 | 3 | null;
  episode?: {
    episode: number;
    title: string | null;
    url: string;
  };
};

export type SimklShow = {
  title: string;
  title_romaji?: string | null;
  url: string;
  alt_titles?: Array<{ name?: string | null }>;
  ids: { simkl_id?: number | string | null; anilist?: number | string | null };
};

export type SimklCalendarPayload = {
  calendar: SimklCalendarEntry[];
  metadata: Record<string, SimklShow>;
};

export type SimklEpisodeSchedule = {
  nextEpisode: number;
  nextReleaseAt: Date;
  previousEpisode: number | null;
  previousReleaseAt: Date | null;
  episodeTitle: string | null;
  finaleType: 1 | 2 | 3 | null;
  episodeUrl: string | null;
};

export type SimklSearchResult = {
  simklId: number;
  title: string;
  subtitle: string | null;
};

const SIMKL_ANIME_CALENDAR_URL = "https://data.simkl.in/calendar/v2/anime.json";

function normalizedTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function findSimklEpisodeSchedule(
  simklId: number,
  payload: SimklCalendarPayload,
  now = new Date(),
): SimklEpisodeSchedule | null {
  const episodes = payload.calendar
    .filter((entry) => entry.simkl_id === simklId && entry.episode)
    .map((entry) => ({ entry, airsAt: parseDate(entry.date) }))
    .filter((value): value is { entry: SimklCalendarEntry & { episode: NonNullable<SimklCalendarEntry["episode"]> }; airsAt: Date } => Boolean(value.airsAt))
    .sort((a, b) => a.airsAt.getTime() - b.airsAt.getTime());

  const next = episodes.find(({ airsAt }) => airsAt.getTime() >= now.getTime());
  if (!next) return null;
  const previous = [...episodes].reverse().find(({ airsAt }) => airsAt.getTime() < now.getTime());

  return {
    nextEpisode: next.entry.episode.episode,
    nextReleaseAt: next.airsAt,
    previousEpisode: previous?.entry.episode.episode ?? null,
    previousReleaseAt: previous?.airsAt ?? null,
    episodeTitle: next.entry.episode.title,
    finaleType: next.entry.finale_type,
    episodeUrl: next.entry.episode.url || null,
  };
}

/** Resolve only an exact AniList English/Romaji title. Never guess from a partial title. */
export function searchSimklCalendarTitles(
  query: string,
  payload: SimklCalendarPayload,
): SimklSearchResult[] {
  const wanted = normalizedTitle(query);
  if (wanted.length < 2) return [];
  return Object.entries(payload.metadata)
    .flatMap(([id, show]) => {
      const names = [show.title, show.title_romaji || "", ...(show.alt_titles || []).map((item) => item.name || "")];
      const matches = names.some((name) => normalizedTitle(name).includes(wanted));
      if (!matches) return [];
      const simklId = Number(show.ids?.simkl_id || id);
      if (!Number.isInteger(simklId) || simklId <= 0) return [];
      return [{ simklId, title: show.title, subtitle: show.title_romaji || null }];
    })
    .slice(0, 12);
}

function isPayload(value: unknown): value is SimklCalendarPayload {
  if (!value || typeof value !== "object") return false;
  const data = value as { calendar?: unknown; metadata?: unknown };
  return Array.isArray(data.calendar) && !!data.metadata && typeof data.metadata === "object";
}

/** Shared, CDN-cached schedule. No per-title requests or user configuration. */
export async function fetchSimklAnimeCalendar(): Promise<{ payload: SimklCalendarPayload; lastModified: string | null }> {
  const response = await fetchCalendar(SIMKL_ANIME_CALENDAR_URL);
  if (!response) throw new Error("SIMKL calendar unavailable");

  const now = new Date();
  const monthlyUrls = Array.from({ length: 4 }, (_, offset) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return `https://data.simkl.in/calendar/v2/${month.getUTCFullYear()}/${month.getUTCMonth() + 1}/anime.json`;
  });
  const monthly = await Promise.all(monthlyUrls.map(fetchCalendar));
  const payloads = [response, ...monthly.filter((item): item is { payload: SimklCalendarPayload; lastModified: string | null } => Boolean(item))];
  const calendar = new Map<string, SimklCalendarEntry>();
  const metadata: Record<string, SimklShow> = {};

  for (const item of payloads) {
    Object.assign(metadata, item.payload.metadata);
    for (const entry of item.payload.calendar) {
      const key = `${entry.simkl_id}:${entry.date}:${entry.episode?.episode || ""}`;
      calendar.set(key, entry);
    }
  }

  return {
    payload: { calendar: [...calendar.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), metadata },
    lastModified: payloads.map((item) => item.lastModified).filter(Boolean).sort().at(-1) || null,
  };
}

async function fetchCalendar(url: string): Promise<{ payload: SimklCalendarPayload; lastModified: string | null } | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Chronicle/1.0" },
    next: { revalidate: 60 * 60 * 4 },
  });
  if (!response.ok) return null;

  const payload: unknown = await response.json();
  if (!isPayload(payload)) return null;

  return { payload, lastModified: response.headers.get("last-modified") };
}
