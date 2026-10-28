import type { AniListMedia } from "@/lib/sources/anilistAiring";

export type NumberingMode = "continuous" | "seasonal" | "unspecified";
export type NumberingStatus = "verified" | "needs_review" | null;

export interface PrequelOffsetResult {
  offset: number | null;
  isReliable: boolean;
  message: string;
}

export interface ProgressComparisonInput {
  current: number;
  latestRemote: number;
  numberingMode?: NumberingMode | null;
  episodeOffset?: number | null;
  remoteIsContinuous?: boolean;
}

export interface ProgressComparisonResult {
  hasNewContent: boolean;
  delta: number;
  remoteInUserUnits: number;
  suspectedMismatch: boolean;
  suggestedAction: "notify" | "needs_review" | "none";
}

/**
 * Calculates episode offset for seasonal anime from AniList relations.
 * Strictly checks that all prequels have known, non-null episode counts.
 */
export function calculateOffsetFromAniListRelations(
  relations?: AniListMedia["relations"],
): PrequelOffsetResult {
  if (!relations || !relations.edges || relations.edges.length === 0) {
    return {
      offset: 0,
      isReliable: true,
      message: "No prequels found; offset 0 assumed for first season",
    };
  }

  const prequels = relations.edges.filter((e) => e.relationType === "PREQUEL");
  if (prequels.length === 0) {
    return {
      offset: 0,
      isReliable: true,
      message: "No prequel relations; season 1 offset 0",
    };
  }

  let totalOffset = 0;
  for (const edge of prequels) {
    const eps = edge.node.episodes;
    if (typeof eps !== "number" || eps <= 0) {
      return {
        offset: null,
        isReliable: false,
        message: `Prequel "${edge.node.title.english || edge.node.title.romaji || edge.node.id}" has unknown episode count`,
      };
    }
    totalOffset += eps;
  }

  return {
    offset: totalOffset,
    isReliable: true,
    message: `Offset ${totalOffset} verified across ${prequels.length} prequel(s)`,
  };
}

/**
 * Converts seasonal episode number to absolute/continuous episode number.
 */
export function toContinuousEpisode(seasonalEpisode: number, offset: number): number {
  return Math.max(0, seasonalEpisode + Math.max(0, offset));
}

/**
 * Converts continuous episode number to seasonal episode number.
 */
export function toSeasonalEpisode(continuousEpisode: number, offset: number): number {
  return Math.max(0, continuousEpisode - Math.max(0, offset));
}

/**
 * Heuristic to detect suspected numbering discrepancies between user's current
 * tracking progress and remote scraped / schedule progress.
 */
export function detectNumberingMismatch(
  current: number,
  remote: number,
  mode?: NumberingMode | null,
): boolean {
  if (mode === "seasonal") return false; // Handled by offset normalization
  // If user is tracking small numbers (<= 26) but remote suddenly jumps past 50 with delta >= 30,
  // or user is tracking 50+ but remote is small (<= 24).
  if (current <= 26 && remote >= 50 && remote - current >= 30) {
    return true;
  }
  if (current >= 50 && remote <= 26) {
    return true;
  }
  return false;
}

/**
 * Safe remote vs. local progress comparison.
 * Never auto-advances progress; preserves user-controlled progress contracts.
 */
export function compareProgress(input: ProgressComparisonInput): ProgressComparisonResult {
  const current = Number(input.current) || 0;
  const latestRemote = Number(input.latestRemote) || 0;
  const mode = input.numberingMode || "unspecified";
  const offset = typeof input.episodeOffset === "number" && input.episodeOffset >= 0
    ? input.episodeOffset
    : null;
  const remoteIsContinuous = input.remoteIsContinuous !== false;

  let remoteInUserUnits = latestRemote;

  if (mode === "seasonal" && offset !== null) {
    if (remoteIsContinuous) {
      // Remote gives continuous episode (e.g., Ep 28), user tracks seasonal (e.g., S2 Ep 4 with offset 24)
      remoteInUserUnits = toSeasonalEpisode(latestRemote, offset);
    } else {
      // Remote is already seasonal
      remoteInUserUnits = latestRemote;
    }
  } else if (mode === "continuous" && !remoteIsContinuous && offset !== null) {
    // Remote gives seasonal episode, user tracks continuous
    remoteInUserUnits = toContinuousEpisode(latestRemote, offset);
  } else if ((mode === "unspecified" || !mode) && offset !== null && offset > 0) {
    // If mode is unspecified, infer from progress: user tracking >= offset or high continuous vs low seasonal
    if (!remoteIsContinuous && (current >= offset || (current >= 50 && latestRemote <= 26))) {
      remoteInUserUnits = toContinuousEpisode(latestRemote, offset);
    } else if (remoteIsContinuous && current < offset) {
      remoteInUserUnits = toSeasonalEpisode(latestRemote, offset);
    }
  }

  const hasNewContent = remoteInUserUnits > current;
  const delta = hasNewContent ? remoteInUserUnits - current : 0;
  const suspectedMismatch = detectNumberingMismatch(current, remoteInUserUnits, mode);

  let suggestedAction: "notify" | "needs_review" | "none" = "none";
  if (suspectedMismatch) {
    suggestedAction = "needs_review";
  } else if (hasNewContent) {
    suggestedAction = "notify";
  }

  return {
    hasNewContent,
    delta,
    remoteInUserUnits,
    suspectedMismatch,
    suggestedAction,
  };
}

/**
 * Formats user-facing episode display string cleanly.
 */
export function formatEpisodeDisplay(params: {
  progress: number;
  numberingMode?: NumberingMode | null;
  seasonNumber?: number | null;
  episodeOffset?: number | null;
}): string {
  const progress = Number(params.progress) || 0;
  const mode = params.numberingMode || "unspecified";
  const season = params.seasonNumber && params.seasonNumber > 1 ? params.seasonNumber : 1;

  if (mode === "seasonal") {
    return `S${season} Ep ${progress}`;
  }

  if (mode === "continuous" && params.episodeOffset !== null && typeof params.episodeOffset === "number" && season > 1) {
    const seasonal = toSeasonalEpisode(progress, params.episodeOffset);
    return `Ep ${progress} (S${season} Ep ${seasonal})`;
  }

  return `Ep ${progress}`;
}

/**
 * Determines whether the user has caught up to a scheduled release.
 * Accounts for seasonal offsets and mixed continuous/seasonal numbering safely.
 */
export function isCaughtUpToRelease(params: {
  progressCurrent: number;
  nextEpisode: number | null;
  numberingMode?: NumberingMode | null;
  seasonNumber?: number | null;
  episodeOffset?: number | null;
  remoteIsContinuous?: boolean;
}): boolean {
  if (params.nextEpisode === null || params.nextEpisode === undefined) return false;
  const current = Number(params.progressCurrent) || 0;
  const offset =
    typeof params.episodeOffset === "number" && params.episodeOffset >= 0
      ? params.episodeOffset
      : 0;
  const remoteIsContinuous = params.remoteIsContinuous === true;
  const mode = params.numberingMode || "unspecified";

  // Determine continuous number of next episode
  const nextContinuous = remoteIsContinuous
    ? params.nextEpisode
    : params.nextEpisode + offset;

  // Determine user's continuous progress
  let userContinuous = current;
  if (mode === "seasonal" && offset > 0) {
    if (current >= offset) {
      // User entered continuous progress (e.g. 50 or 100 while offset is 91)
      userContinuous = current;
    } else {
      // User entered seasonal progress (e.g. S4 Ep 5, with offset 91 => continuous 96)
      userContinuous = current + offset;
    }
  }

  return userContinuous >= nextContinuous;
}
