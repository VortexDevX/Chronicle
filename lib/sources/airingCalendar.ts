export type AiringCalendarEntry = {
  simkl_id: number;
  date: string;
  episode?: {
    episode: number;
    title?: string | null;
    url?: string | null;
  };
};

export type AiringCalendarShow = {
  title: string;
  title_romaji?: string | null;
  alt_titles?: Array<{ name?: string }>;
  poster?: string | null;
  ids?: {
    simkl_id?: number;
    anilist?: number | string;
    mal?: number | string;
  };
};

export type ResolvedSchedule = {
  nextEpisode: number;
  nextReleaseAt: Date;
  previousEpisode: number | null;
  previousReleaseAt: Date | null;
  episodeTitle: string | null;
  posterUrl: string | null;
  source: "anilist" | "calendar";
};

type CalendarPayload = {
  calendar: AiringCalendarEntry[];
  metadata: Record<string, AiringCalendarShow>;
};

let cachedCalendar: { payload: CalendarPayload; expiresAt: number } | null = null;
const CALENDAR_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function normalizeSearch(val: string): string {
  return (val || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function fetchAiringCalendar(): Promise<CalendarPayload> {
  const nowMs = Date.now();
  if (cachedCalendar && cachedCalendar.expiresAt > nowMs) {
    return cachedCalendar.payload;
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-indexed

  // Fetch current month + next 2 months for upcoming coverage
  const targetMonths = [0, 1, 2].map((offset) => {
    const d = new Date(Date.UTC(year, currentMonth + offset, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `https://data.simkl.in/calendar/v2/${y}/${m}/anime.json`;
  });

  try {
    const responses = await Promise.all(
      targetMonths.map((url) =>
        fetch(url, {
          headers: { "User-Agent": "Chronicle/1.0" },
          next: { revalidate: 60 * 60 * 4 },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );

    const mergedMetadata: Record<string, AiringCalendarShow> = {};
    const mergedCalendar: AiringCalendarEntry[] = [];

    for (const res of responses) {
      if (!res || typeof res !== "object") continue;
      if (res.metadata && typeof res.metadata === "object") {
        Object.assign(mergedMetadata, res.metadata);
      }
      if (Array.isArray(res.calendar)) {
        mergedCalendar.push(...res.calendar);
      }
    }

    const payload: CalendarPayload = {
      calendar: mergedCalendar,
      metadata: mergedMetadata,
    };

    cachedCalendar = { payload, expiresAt: nowMs + CALENDAR_TTL_MS };
    return payload;
  } catch {
    if (cachedCalendar) return cachedCalendar.payload;
    return { calendar: [], metadata: {} };
  }
}

export function getSimklPosterUrl(posterPath?: string | null): string | null {
  if (!posterPath) return null;
  if (posterPath.startsWith("http://") || posterPath.startsWith("https://")) {
    return posterPath;
  }
  return `https://simkl.in/posters/${posterPath}_0.jpg`;
}

export async function resolveAiringCalendarSchedule(params: {
  anilist_id?: number | string | null;
  simkl_id?: number | string | null;
  title?: string | null;
  now?: Date;
}): Promise<ResolvedSchedule | null> {
  const { calendar, metadata } = await fetchAiringCalendar();
  if (calendar.length === 0) return null;

  const now = params.now || new Date();
  const nowMs = now.getTime();

  let targetSimklId = Number(params.simkl_id);
  const targetAnilistId = Number(params.anilist_id);

  // 1. If simkl_id is missing, search metadata by anilist ID
  if ((!targetSimklId || targetSimklId <= 0) && Number.isInteger(targetAnilistId) && targetAnilistId > 0) {
    for (const [idStr, show] of Object.entries(metadata)) {
      if (Number(show.ids?.anilist) === targetAnilistId) {
        targetSimklId = Number(idStr);
        break;
      }
    }
  }

  // 2. If still missing, match by normalized title
  if ((!targetSimklId || targetSimklId <= 0) && params.title) {
    const queryNorm = normalizeSearch(params.title);
    if (queryNorm.length >= 3) {
      for (const [idStr, show] of Object.entries(metadata)) {
        const names = [
          show.title,
          show.title_romaji || "",
          ...(show.alt_titles || []).map((a) => a.name || ""),
        ];
        if (names.some((n) => normalizeSearch(n) === queryNorm)) {
          targetSimklId = Number(idStr);
          break;
        }
      }
    }
  }

  if (!targetSimklId || targetSimklId <= 0) return null;

  // Find episodes for this show
  const showEpisodes = calendar
    .filter((entry) => entry.simkl_id === targetSimklId && entry.episode && entry.date)
    .map((entry) => {
      const airsAt = new Date(entry.date);
      return {
        episode: entry.episode!.episode,
        title: entry.episode!.title || null,
        airsAt,
      };
    })
    .filter((e) => !isNaN(e.airsAt.getTime()))
    .sort((a, b) => a.airsAt.getTime() - b.airsAt.getTime());

  if (showEpisodes.length === 0) return null;

  // Upcoming episode: first episode with airsAt >= nowMs
  const next = showEpisodes.find((e) => e.airsAt.getTime() >= nowMs);
  const previous = [...showEpisodes].reverse().find((e) => e.airsAt.getTime() < nowMs);

  if (!next) return null;

  const showMeta = metadata[String(targetSimklId)];
  const posterUrl = getSimklPosterUrl(showMeta?.poster);

  return {
    nextEpisode: next.episode,
    nextReleaseAt: next.airsAt,
    previousEpisode: previous?.episode ?? null,
    previousReleaseAt: previous?.airsAt ?? null,
    episodeTitle: next.title,
    posterUrl,
    source: "calendar",
  };
}
