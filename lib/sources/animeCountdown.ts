import * as cheerio from "cheerio";
import { fetchTrackerUrlHtml, ScrapeTrackerOptions } from "@/lib/trackerScraper";

const ANIME_COUNTDOWN_HOST = "animecountdown.com";

export type EpisodeScheduleResult = {
  source: "animecountdown";
  title: string | null;
  episode: number | null;
  releaseAt: Date | null;
  previousEpisode: number | null;
  previousReleaseAt: Date | null;
  platform: string | null;
  sourceUrl: string;
};

export function isAnimeCountdownUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase().replace(/^www\./, "") === ANIME_COUNTDOWN_HOST;
  } catch {
    return false;
  }
}

function episodeFromText(value: string): number | null {
  const match = value.match(/\b(?:episode|ep)\s*(\d+(?:\.\d+)?)/i);
  const episode = match ? Number(match[1]) : NaN;
  return Number.isFinite(episode) && episode > 0 ? episode : null;
}

function timestampFrom($node: cheerio.Cheerio<any>): Date | null {
  const seconds = Number($node.find("[data-ts]").first().attr("data-ts"));
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function platformFromText(value: string): string | null {
  const match = value.replace(/\s+/g, " ").match(/\bon\s+([^\n]+?)(?:\s*$|\.)/i);
  return match?.[1]?.trim() || null;
}

/** Parses server-rendered UTC Unix timestamps. Never reads countdown text or browser timezone. */
export function parseAnimeCountdownPage(html: string, sourceUrl: string): EpisodeScheduleResult {
  if (!html.trim()) throw new Error("Anime Countdown returned empty HTML");
  const $ = cheerio.load(html);
  const airing = $("countdown-content-page-item.type-airing");
  if (!airing.length) throw new Error("Anime Countdown schedule not found in DOM");

  const next = airing.filter((_index, element) => /countdown to episode/i.test($(element).text())).first();
  const previous = airing.filter((_index, element) => /episode\s+\d+\s+.*aired/i.test($(element).text())).first();
  const nextText = next.text();
  const previousText = previous.text();

  return {
    source: "animecountdown",
    title: $("countdown-content-page-info-right-title h1").first().text().trim() || null,
    episode: episodeFromText(nextText),
    releaseAt: timestampFrom(next),
    previousEpisode: episodeFromText(previousText),
    previousReleaseAt: timestampFrom(previous),
    platform: platformFromText(nextText) || platformFromText(previousText),
    sourceUrl,
  };
}

export async function fetchAnimeCountdownSchedule(
  sourceUrl: string,
  options: ScrapeTrackerOptions = {},
): Promise<EpisodeScheduleResult> {
  if (!isAnimeCountdownUrl(sourceUrl)) {
    throw new Error("Schedule URL must be an https://animecountdown.com page");
  }
  const { html, resolvedUrl } = await fetchTrackerUrlHtml(sourceUrl, options);
  if (!isAnimeCountdownUrl(resolvedUrl)) {
    throw new Error("Anime Countdown URL redirected off animecountdown.com");
  }
  return parseAnimeCountdownPage(html, resolvedUrl);
}
