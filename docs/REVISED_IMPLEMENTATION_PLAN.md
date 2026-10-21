# Chronicle: Revised Architectural Plan & Implementation Roadmap

**Date:** October 13, 2026  
**Status:** Approved Architectural Specification  
**Project:** Chronicle Media Tracker  
**Target:** Safe Simkl Removal, AniList Airing Integration, Seasonal/Continuous Progress Normalization, Donghua Reliability, and UX Simplification.

---

## 1. Executive Summary & Core Objectives

Chronicle is transitioning to an **AniList-first media engine**, eliminating brittle scraping dependencies and Simkl calendar constraints while ensuring **zero data loss** and **zero progress regressions** on existing user libraries.

This document establishes the architecture, safety contracts, and phased execution plan to achieve:
1. **Seasonal Numbering Contract with Existing Progress Protection:** Seasonal numbering becomes the primary format for new metadata, while existing entries retain their exact continuous/legacy progress semantics without blind defaults.
2. **Complete Simkl Removal & Safe AniList Airing Pipeline:** Replacing Simkl's static 4-month calendar dump with AniList GraphQL (`nextAiringEpisode`), backed by batched queries, rate-limit protection, and explicit state handling for concluded/pending shows.
3. **Anime/Donghua Tracking:** AniList provides release tracking; streaming links remain bookmarks. Manhwa retains chapter scraping.
4. **First-Class Donghua Reliability:** Leveraging AniList's native Chinese animation catalog (`countryOfOrigin: "CN"`) and introducing multi-alias title management (English, Pinyin, Hanzi, Custom).
5. **Radically Simplified User Experience:** An Omnisearch dialog (`⌘K`) for instant 1-click addition across Anime, Donghua, and Manhwa; a clean Essentials-first media form; and the elimination of raw developer plumbing (UUIDs, regex scraper URLs, test buttons).

---

## 2. The Three Architectural Safety Contracts

### Contract 1: Preserving Existing Progress Semantics (No Blind Defaults)
- **The Problem:** Blindly defaulting every existing library entry to `numbering_mode: "seasonal"` with `episode_offset: 0` would corrupt tracking for long-running series (e.g. Donghua at continuous episode 74, or manhwa at chapter 150+).
- **The Solution:**
  - `numbering_mode` schema supports three explicit states:
    ```typescript
    numbering_mode: {
      type: String,
      enum: ["continuous", "seasonal", "unspecified"],
      default: "unspecified",
    }
    season_number: { type: Number, default: 1 }
    episode_offset: { type: Number, default: null } // null = no offset assumed
    ```
  - **Existing Records:** All existing items remain `numbering_mode: "unspecified"` and `episode_offset: null`. Their `progress_current` numbers remain 100% untouched.
  - **Remote Comparison Contract in Cron:**
    - If `numbering_mode === "seasonal"`: compare seasonal episode directly ($E_{remote} > \text{progress\_current}$).
    - If `numbering_mode === "continuous"` and `episode_offset != null`: compare $(E_{remote} + \text{episode\_offset}) > \text{progress\_current}$.
    - If `numbering_mode === "unspecified"`:
      - If $E_{remote} \ge \text{progress\_current}$ and numbers are within standard single-season bounds ($\le 26$): safely compare directly.
      - **If $E_{remote} < \text{progress\_current}$ (e.g., Remote reports Season Episode 12, but User is on Episode 74):** Chronicle **NEVER** assumes the user is caught up, **NEVER** overwrites progress, and **NEVER** fires a false notification. Instead, it marks `numbering_status: "offset_needed"`.
  - **Actionable UI Cue:** In the Updates Inbox and on the Media Card, a non-intrusive chip appears: *"Numbering adjustment: Watching Ep 74 vs Season Ep 12 (Set Offset)"*. The user can confirm the offset with a single click.

---

### Contract 2: Deterministic Simkl $\to$ AniList Migration (Zero Guesswork)
- **The Problem:** Fuzzy title matching could map to the wrong season, ova, or reboot, causing permanent corruption.
- **The Solution:**
  - `simkl_id` is retained as an optional, non-breaking schema field (`simkl_id: { type: Number, default: null }`) for backward compatibility. No data is stripped.
  - Migration script (`scripts/migrateSimklToAnilist.ts`) follows a strict 4-tier hierarchy:
    1. **Tier 1 (Already Verified):** If an entry already has an `anilist_id`, leave it untouched.
    2. **Tier 2 (Deterministic Cross-Reference):** If Simkl metadata contains an exact external ID link (`show.ids.anilist`), use that verified ID.
    3. **Tier 3 (Identical Exact Match):** If the title matches 1:1 identically with exact format equivalence (`TV` / `ONA`).
    4. **Tier 4 (Ambiguous / Multi-Season / Fuzzy):** **DO NOT GUESS.** Flag `migration_status: "manual_review_needed"`.
  - Ambiguous matches are presented in a dedicated *"Review Mappings"* drawer on Release Radar with visual thumbnail cards for 1-click user confirmation.
  - The migration script supports `--dry-run` to audit matches before executing.

---

### Contract 3: AniList Airing State Machine & Rate-Limit Resilience
- **The Problem:** AniList's `nextAiringEpisode` is only present when exact broadcast slots are scheduled. Series on mid-season breaks, hiatuses, or completed shows lack upcoming dates. Sequential querying would also exhaust AniList's 90 req/min rate limit.
- **The Solution:**
  - Four explicit Airing States in Chronicle:
    ```typescript
    export type AiringScheduleState =
      | "SCHEDULED"        // nextAiringEpisode exists with date & episode number
      | "SCHEDULE_PENDING" // Active/Releasing, but broadcast slot not yet locked
      | "HIATUS"           // Explicitly on hiatus or delayed
      | "CONCLUDED";       // Show finished airing all episodes
    ```
    - **`SCHEDULED`:** Shows release countdown timer and target episode; cron checks notify on release.
    - **`SCHEDULE_PENDING`:** Release Radar displays *"Airing (Schedule Pending)"* card. Cron suppresses false notifications.
    - **`HIATUS`:** Displays *"On Hiatus"* badge.
    - **`CONCLUDED`:** Displays *"Completed (Total X Episodes)"* badge.
    - **Result:** No active show disappears from radar, and no false notifications fire.
  - **Batching, Rate-Limiting & Backoff:**
    - Queries in `checkChapters` cron batch up to 50 IDs per GraphQL request using `Page(page: 1, perPage: 50) { media(id_in: $ids) { ... } }`.
    - **Conservative Configurable Limiter:** Default capped at 25 requests/minute (configurable via `ANILIST_RATE_LIMIT_PER_MINUTE`, bounded to 10–30), comfortably below AniList's temporary 30 req/min limit.
    - **Response Header Inspection:** Reads `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` on every response to dynamically throttle before limits are breached.
    - **Retry-After Backoff:** On HTTP 429 responses, inspects `Retry-After` header and pauses requests accordingly with jitter, rather than failing immediately or spamming retries.
    - **Aggressive Caching:** Airing schedules cached with 4-hour TTL for active shows, 24 hours for pending, and 7-day TTL for completed shows.

---

## 3. Detailed Architecture Specifications

### 3.1 AniList Airing Client (`lib/sources/anilistAiring.ts`)
```typescript
export type AniListMediaDetails = {
  id: number;
  title: {
    english: string | null;
    romaji: string | null;
    native: string | null;
  };
  countryOfOrigin: string; // "JP", "CN", "KR"
  format: string; // "TV", "ONA", "MOVIE", "NOVEL", "MANGA"
  status: "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
  episodes: number | null;
  nextAiringEpisode: {
    episode: number;
    airingAt: number; // Unix timestamp
    timeUntilAiring: number;
  } | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
  } | null;
  relations?: {
    edges: Array<{
      relationType: string; // "PREQUEL", "SEQUEL"
      node: { id: number; episodes: number | null; title: { english: string | null; romaji: string | null } };
    }>;
  };
};
```

### 3.2 Progress Bridge (`lib/services/media/progressBridge.ts`)
```typescript
export function computeEffectiveRemoteProgress(
  remoteEpisode: number,
  mode: "continuous" | "seasonal" | "unspecified",
  baseOffset: number | null
): number {
  if (mode === "continuous" && typeof baseOffset === "number" && baseOffset > 0) {
    return baseOffset + remoteEpisode;
  }
  return remoteEpisode;
}

export function shouldNotifyUpdate(
  currentProgress: number,
  remoteEpisode: number,
  mode: "continuous" | "seasonal" | "unspecified",
  baseOffset: number | null
): { notify: boolean; offsetNeeded: boolean } {
  const effectiveRemote = computeEffectiveRemoteProgress(remoteEpisode, mode, baseOffset);
  if (mode === "unspecified" && remoteEpisode < currentProgress) {
    return { notify: false, offsetNeeded: true };
  }
  return { notify: effectiveRemote > currentProgress, offsetNeeded: false };
}
```

### 3.3 Decoupling Bookmarks from Scrapers
- In `MediaModal.tsx` and `types/media.ts`:
  - `tracker_url` is rebranded to **"Watch / Reading Bookmark"**.
  - Any valid URL can be stored. If a scraper host fails with a 403 or timeout, the URL remains saved and functional as a 1-click launch button.
  - Anime and Donghua release notifications are driven by AniList; Watch URLs remain bookmarks.

---

## 4. Phased Implementation Roadmap

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Stability & Migration (Simkl Removal ➔ AniList Airing)                  │
│ • Create `lib/sources/anilistAiring.ts` (batched GraphQL, rate-limited, cached). │
│ • Create unit tests in `lib/sources/anilistAiring.test.ts`.                      │
│ • Create `scripts/migrateSimklToAnilist.ts` with 4-tier matching & `--dry-run`.  │
│ • Update Release Radar (`queue/page.tsx`, `api/release-radar/`) to AniList.      │
│ • Update Home upcoming releases (`upcomingReleases.ts`, `api/home/`).            │
│ • Update Cover cache (`store/coverCache.ts`, `api/anime-cover/route.ts`).        │
│ • Update Cron chapter check (`api/cron/checkChapters/route.ts` & test).          │
│ • Delete `lib/sources/simklCalendar.ts` and `lib/sources/simklCalendar.test.ts`. │
│ • Verification Gate: `npm run typecheck`, `npm run lint`, `npm test`, build.     │
├──────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Safe Progress Engine & Numbering Normalization                          │
│ • Update `MediaItem.ts` and `types/media.ts` schema:                             │
│   `numbering_mode`, `season_number`, `episode_offset`, `numbering_status`.       │
│ • Build `lib/services/media/progressBridge.ts` & comprehensive unit tests.        │
│ • Integrate Prequel relation traversal to compute offsets automatically.         │
│ • Update `checkChapters` cron to use the Progress Bridge contracts.              │
│ • Verification Gate: Full Vitest suite covering seasonal, continuous, and        │
│   unspecified progress edge cases.                                               │
├──────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: AniList Schedules & Manhwa Scraper Scope                               │
│ • Add `title_aliases` schema (English, Pinyin, Hanzi, Custom).                   │
│ • Support Donghua via AniList GraphQL (`countryOfOrigin: "CN"`).                 │
│ • Use AniList for Anime/Donghua schedules; retain Manhwa scraping.               │
│ • Isolate Manhwa scrapers: network timeouts/403s recorded cleanly without        │
│   failing cron queues or invalidating bookmarks.                                 │
│ • Verification Gate: Scraper tests, alias resolution tests, cron stability.     │
├──────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Simplified User Experience & Unified Search                             │
│ • Create `components/OmnisearchModal.tsx` (`⌘K` unified AniList + MangaDex).     │
│ • Create `app/api/search/unified/route.ts`.                                      │
│ • Refactor `MediaModal.tsx`: Essentials visible; Collapsed drawer for Bookmarks, │
│   Offsets, Aliases; Raw UUIDs and developer plumbing hidden.                     │
│ • Update Release Radar UI with distinct SCHEDULE_PENDING and CONCLUDED cards.   │
│ • Update README.md to remove Simkl references.                                   │
│ • Verification Gate: Desktop & mobile browser check, quality gates.             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Verification Gates & Quality Checklist

Before completing each phase, the following checks will be enforced:
1. `npm run typecheck` $\to$ Clean TypeScript compilation (`tsc --noEmit`).
2. `npm run lint` $\to$ Clean ESLint execution (`eslint .`).
3. `npm test` $\to$ Complete Vitest suite passing with zero regressions.
4. `npm run build` $\to$ Production Next.js build succeeding cleanly.
5. End-of-Phase Report summarizing completed work, test outputs, and validation details.
