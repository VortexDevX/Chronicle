import { logInfo } from "@/lib/log";
import { fetchWithTimeout } from "@/lib/externalFetch";

type MyAnimeListSearchResponse = {
  data?: Array<{
    node?: {
      title?: string;
      main_picture?: { large?: string | null; medium?: string | null } | null;
      alternative_titles?: {
        en?: string | null;
        ja?: string | null;
        synonyms?: string[];
      } | null;
    };
  }>;
};

let missingClientIdLogged = false;
let apiUnavailableUntil = 0;
const API_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000;

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export async function fetchMyAnimeListCoverByTitle(title: string): Promise<string | null> {
  const clientId = process.env.MAL_CLIENT_ID?.trim();
  if (!clientId) {
    if (!missingClientIdLogged) {
      missingClientIdLogged = true;
      logInfo("mal_cover_missing_client_id");
    }
    return null;
  }
  if (Date.now() < apiUnavailableUntil) return null;

  const url = new URL("https://api.myanimelist.net/v2/anime");
  url.searchParams.set("q", title);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "main_picture,alternative_titles");

  try {
    const response = await fetchWithTimeout(
      url,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-MAL-CLIENT-ID": clientId,
        },
      },
      5000,
    );

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      apiUnavailableUntil = Date.now() + API_UNAVAILABLE_COOLDOWN_MS;
      logInfo("mal_cover_api_unavailable", {
        status: response.status,
        cooldownSeconds: API_UNAVAILABLE_COOLDOWN_MS / 1000,
      });
      return null;
    }
    if (!response.ok) return null;

    const json = (await response.json()) as MyAnimeListSearchResponse;
    const entries = (json.data || []).flatMap((item) => item.node ? [item.node] : []);
    const wantedTitle = normalizeTitle(title);
    const match = entries.find((entry) => {
      const titles = [
        entry.title,
        entry.alternative_titles?.en,
        entry.alternative_titles?.ja,
        ...(entry.alternative_titles?.synonyms || []),
      ];
      return titles.some((candidate) => candidate && normalizeTitle(candidate) === wantedTitle);
    }) || entries[0];

    return match?.main_picture?.large || match?.main_picture?.medium || null;
  } catch {
    apiUnavailableUntil = Date.now() + API_UNAVAILABLE_COOLDOWN_MS;
    logInfo("mal_cover_api_unavailable", {
      status: "network_error",
      cooldownSeconds: API_UNAVAILABLE_COOLDOWN_MS / 1000,
    });
    return null;
  }
}
