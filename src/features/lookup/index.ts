/** Metadata lookup — AniList + MAL/Jikan fallback. */

import type { MediaLookup } from "../../types/media.js";

async function lookupAniList(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  const anilistType =
    mediaType === "Anime" || mediaType === "Donghua" ? "ANIME" : "MANGA";

  const query = `
    query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        title { romaji english native }
        episodes
        chapters
        volumes
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      variables: { search: title, type: anilistType },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const media = json?.data?.Media;
  if (!media) return null;

  const total =
    anilistType === "ANIME"
      ? media.episodes
      : (media.chapters ?? media.volumes ?? undefined);

  return {
    title: media.title?.english || media.title?.romaji || media.title?.native,
    total,
    source: "AniList",
  };
}

async function lookupMALViaJikan(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  const isAnimeType = mediaType === "Anime" || mediaType === "Donghua";
  const endpoint = isAnimeType ? "anime" : "manga";
  const res = await fetch(
    `https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(title)}&limit=1`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  const first = json?.data?.[0];
  if (!first) return null;

  const total = isAnimeType
    ? (first.episodes ?? undefined)
    : (first.chapters ?? first.volumes ?? undefined);

  return {
    title: first.title_english || first.title || undefined,
    total,
    source: "MAL",
  };
}

export async function lookupMediaMeta(
  title: string,
  mediaType: string,
): Promise<MediaLookup | null> {
  if (mediaType === "Light Novel") return null;

  try {
    const aniList = await lookupAniList(title, mediaType);
    if (aniList) return aniList;
  } catch {
    // Try fallback source next
  }
  try {
    return await lookupMALViaJikan(title, mediaType);
  } catch {
    return null;
  }
}
