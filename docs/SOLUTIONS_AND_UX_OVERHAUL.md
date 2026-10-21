# Chronicle: System Analysis, Problem Diagnosis & Architectural Solutions

**Date:** October 13, 2026  
**Project:** Chronicle Media Tracker  
**Target Areas:** Simkl Schedule Fallback, Seasonal vs. Continuous Numbering, AniList Donghua Tracking, and End-to-End Userflow Simplification.

---

## Executive Summary

Chronicle is a high-performance, beautifully designed self-hosted media tracker with a solid foundation (Next.js App Router, MongoDB, Zustand, and automated cron pipelines). However, as the application has grown to support multiple media domains (**Anime**, **Manhwa**, **Donghua**, and **Light Novels**), several critical architectural and user-experience friction points have emerged:

1. **Seasonal vs. Continuous Mismatches:** Anime/Donghua entries in Simkl and AniList reset episode numbers per season (e.g., Season 2 Episode 1), while viewers and pirate aggregators track continuous numbering (e.g., Episode 75). Chronicle compares these numbers naively, causing updates to break or forcing users to create fragmented, redundant entries for every season.
2. **Silent Simkl Calendar Failures:** The current Simkl integration relies exclusively on a static 4-month CDN dump (`calendar/v2/anime.json`). Shows that are concluded, on hiatus, classified under Simkl TV instead of Anime, or outside the 120-day airing window match successfully in the database but silently fail to produce any schedule or progress updates.
3. **AniList Schedule Coverage:** Anime and Donghua progress use AniList schedules, with the airing-calendar API retained as backup. Watch URLs remain bookmarks.
4. **Donghua Identity Crisis:** Donghua suffers from multiple title aliases (English vs. Pinyin vs. Hanzi) and seasonal vs. multi-year run formats (*Nian Fan*).
5. **High UX Friction & Leaked Plumbing:** The current entry creation and editing workflow exposes internal developer plumbing (MangaDex UUIDs, regex scraper URLs, test tracker buttons, SIMKL calendar toggles) to end users. Normal users do not understand these mechanisms and abandon or struggle with basic tracking.

This document delivers a root-cause breakdown of each issue and provides actionable, step-by-step technical and product solutions to modernize, stabilize, and simplify Chronicle.

---

## 1. Problem Analysis & Diagnosis

### Problem 1: Seasonal vs. Continuous Numbering (Simkl vs. Aggregators)

#### Technical Root Cause
In `lib/models/MediaItem.ts`, media tracking relies on flat scalar fields:
```typescript
progress_current: { type: Number, default: 0 },
progress_total: { type: Number, default: 0 },
latest_remote_progress: { type: Number, default: null }
```

In `app/api/cron/checkChapters/route.ts` and `lib/sources/simklCalendar.ts`:
- Simkl calendar entries represent episodes as:
  `entry.episode.episode = 12` (meaning Episode 12 of the currently airing season).
- Chronicle writes: `latest_remote_progress = 12`.
- When the cron evaluates updates:
  ```typescript
  if (Number.isFinite(storedLatest) && storedLatest > current) {
    // Notify user of new episode
  }
  ```
- If a user has continuous progress (e.g., `progress_current = 74` for *Battle Through the Heavens* or *Soul Land*), the check evaluates `12 > 74` (which is `false`).
- **Result:** Chronicle thinks the user is ahead of remote. No notifications are fired, no updates appear in the Updates Inbox, and the user cannot advance their continuous progress automatically.
- **Current Workaround:** The user is forced to create separate entries: `"Title Season 1"`, `"Title Season 2"`, `"Title Season 3"`, manually link them via `linked_entries`, and reset their progress counter to 0 for each season.

```
┌─────────────────────────────────────────────────────────────────┐
│ Current Behavior                                                │
│                                                                 │
│ Streaming / User Progress: Episode 74                           │
│ Simkl Airing Schedule:     Season 5, Episode 12                 │
│ Comparison:                12 > 74  ───► FALSE (Silent failure) │
└─────────────────────────────────────────────────────────────────┘
```

---

### Problem 2: Some Entries "Don't Work" Even If Selected in Simkl

#### Technical Root Cause
The current Simkl integration in `lib/sources/simklCalendar.ts` does **not** query the Simkl REST API (`https://api.simkl.com`). Instead, it pulls a pre-rendered calendar JSON dump:
```typescript
const SIMKL_ANIME_CALENDAR_URL = "https://data.simkl.in/calendar/v2/anime.json";
```
Chronicle fetches `anime.json` plus the next 3 monthly files (`/year/month/anime.json`).

1. **Airing Window Constraint:** This file contains **only** shows with active or announced air dates in that ~120-day window. If a show has ended, has no confirmed upcoming episode date, or is between seasons, it does not exist in `payload.calendar`.
2. **Category Mismatch:** Simkl maintains separate databases for `anime`, `tv`, and `movies`. A significant portion of Chinese Donghua is cataloged under **TV** or **Animation** rather than **Anime**. Those shows never appear in `anime.json`.
3. **Silent Drop in UI & Cron:**
   - In `app/api/release-radar/match/route.ts`, the user matches an entry to `simkl_id`.
   - But in `lib/sources/simklCalendar.ts`:
     ```typescript
     export function findSimklEpisodeSchedule(simklId: number, payload: SimklCalendarPayload) {
       const episodes = payload.calendar.filter((entry) => entry.simkl_id === simklId && entry.episode);
       if (episodes.length === 0) return null; // Returns NULL!
     ```
   - In `app/api/release-radar/route.ts`:
     ```typescript
     if (schedule.nextEpisode === null || schedule.nextReleaseAt === null) return [];
     ```
     The show is filtered out of `items`.
   - In `checkChapters`: `schedule` is `null`, so `latest_remote_progress` is never touched.
   - **Result:** To the user, they clicked "Match", the ID was saved, but the show remains completely inert on Release Radar and receives zero notifications.

---

### Problem 3: Anime and Donghua Progress Sources

Anime and Donghua progress comes from AniList. The airing-calendar API remains a backup for missing schedules. Chronicle does not scrape Anime or Donghua pages; user Watch URLs are bookmarks. Manhwa retains tracker scraping.

---

### Problem 4: Donghua Tracking & Simkl Schedule Disconnect

#### Technical Root Cause
Donghua occupies an inconsistent position across international databases and pirate aggregators:
- **Title Polysemy:** Donghua titles have 3–4 distinct names:
  - English: *Battle Through the Heavens*
  - Pinyin: *Doupo Cangqiong*
  - Chinese: *斗破苍穹*
  - Fan Translation: *Fights Break Sphere*
- **Database Fragmentation:**
  - AniList catalogs Donghua under `countryOfOrigin: "CN"`, format `TV` or `ONA`.
  - Simkl catalogs some under Anime, some under TV, and some are missing entirely.
  - MyAnimeList often delays adding Donghua or lists them strictly by Romaji/Pinyin.
- **Airing Format:** Many top Donghuas run as *Nian Fan* (multi-year continuous weekly broadcast: 52 to 104+ episodes continuous), unlike the strict 12/24 episode seasonal batches of Japanese Anime.
- **Progress Source:** AniList is primary; the airing-calendar API remains a backup.

---

### Problem 5 & 6: The User Flow Barrier (Leaked Developer Plumbing)

#### The Problem
Chronicle's current modal and workflow requires the user to act like an API developer or system administrator:

| Current Field in MediaModal | Why It Frustrates Normal Users |
|---|---|
| **Tracker URL** | Users don't know which 6 sites are supported or why their favourite scanlator gives an error. |
| **MangaDex URL or ID** | Normal users do not know what a UUID is (e.g. `a1c4b72e-...`) or how to extract it from an address bar. |
| **SIMKL Calendar vs Scraper toggle** | Users don't care how Chronicle fetches data; they just want to track their watch/read progress. |
| **Test Tracker Button** | Exposes scraper latency, regex diagnostics, and error codes directly in the form. |
| **Release Radar "Needs Matching"** | Requires visiting a separate tab to fix titles that failed title-normalization matching. |
| **Separate Manual Entry Form** | Users must manually type the title, pick the type, guess total chapters, find a cover image URL, etc. |

Users expect the simplicity of **AniList, Letterboxd, or TV Time**:
> Type a title in a single search bar ➔ Click the matching card ➔ Set current episode/chapter ➔ Done.

---

## 2. Proposed Architectural Solutions

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CHRONICLE ARCHITECTURE TARGET                            │
│                                                                                        │
│  USER INTERFACE                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Omnisearch Bar (Title / URL Auto-detect)                      │  │
│  │     Type "Solo Leveling" ──► Auto-populates Anime, Manhwa & Light Novel cards    │  │
│  └──────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                         │                                              │
│  METADATA & SCHEDULE ENGINE             │                                              │
│  ┌──────────────────────────────────────▼───────────────────────────────────────────┐  │
│  │  Unified Media Resolver (lib/services/media/resolver.ts)                         │  │
│  │  ├── Anime/Donghua: AniList GraphQL + Simkl REST API Fallback                    │  │
│  │  ├── Manhwa:        MangaDex API + Kitsu/AniList Manga API                       │  │
│  │  └── Novels:        NovelUpdates / AniList Light Novel Search                    │  │
│  └──────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                         │                                              │
│  NUMBERING & PROGRESS ENGINE            │                                              │
│  ┌──────────────────────────────────────▼───────────────────────────────────────────┐  │
│  │  Dual-Mode Episode System (Continuous ◄──► Seasonal Bridge)                      │  │
│  │  - Episode Offset: `absolute_progress = season_base_offset + remote_episode`     │  │
│  │  - Prequel Chain: Auto-sums prior season episode counts from AniList             │  │
│  └──────────────────────────────────────┬───────────────────────────────────────────┘  │
│                                         │                                              │
│  ROBUST SYNC & SCRAPING ENGINE          │                                              │
│  ┌──────────────────────────────────────▼───────────────────────────────────────────┐  │
│  │  Hybrid Provider Pipeline (lib/sources/pipeline.ts)                              │  │
│  │  ├── Primary: Official / Community APIs (AniList Airing, MangaDex API)           │  │
│  │  └── Fallback: Scraper via Cloudflare Proxy / FlareSolverr / Alternative Feeds   │  │
│  │  Bookmark Links Decoupled from Release Trackers                                  │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Solution 1: Resolving Seasonal vs. Continuous Numbering

Instead of forcing users to create disconnected entries or suffer broken comparisons, we introduce an **Episode Offset & Numbering Mode** contract in `MediaItem`.

#### 1. Schema Enhancement (`lib/models/MediaItem.ts`)
```typescript
// Add to mediaSchema:
episode_numbering_mode: {
  type: String,
  enum: ["continuous", "seasonal"],
  default: "continuous",
},
season_number: {
  type: Number,
  default: 1,
},
season_base_offset: {
  type: Number,
  default: 0, // e.g., if Season 2 starts after 24 episodes of Season 1, offset = 24
},
```

#### 2. Progress Normalization Logic (`lib/services/media/progressBridge.ts`)
When remote data arrives from Simkl or AniList (which sends Season-based numbering, e.g. Episode 12):
```typescript
export function computeEffectiveRemoteProgress(
  remoteEpisode: number,
  mode: "continuous" | "seasonal",
  baseOffset: number
): number {
  if (mode === "continuous" && baseOffset > 0) {
    return baseOffset + remoteEpisode;
  }
  return remoteEpisode;
}
```

#### 3. Automatic Offset Calculation via AniList Prequel Traversal
AniList returns franchise relations:
```graphql
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { english romaji }
    episodes
    relations {
      edges {
        relationType # PREQUEL, SEQUEL
        node {
          id
          title { english romaji }
          episodes
        }
      }
    }
  }
}
```
If Chronicle detects the user added Season 2 of a show, it queries the `PREQUEL` node, reads `episodes = 24`, and **automatically sets `season_base_offset = 24`**.
- User enters continuous `74`.
- Remote airs Season 5, Episode 12 with `season_base_offset = 62`.
- Remote becomes `62 + 12 = 74`.
- When Episode 13 airs: Remote becomes `75`.
- `75 > 74` ➔ **Notification fires seamlessly!**

---

### Solution 2: Fixing Simkl & Expanding Release Radar Beyond the 4-Month Dump

#### 1. Dual-Tier Schedule Architecture
Replace the single static calendar file with a two-tier lookup:

| Tier | Source | Purpose | Latency |
|---|---|---|---|
| **Tier 1 (Fast Batch)** | `data.simkl.in/calendar/v2/anime.json` | High-speed cache for currently airing anime/donghua in the current season. | Sub-millisecond (in-memory) |
| **Tier 2 (Precise Fallback)** | **AniList Airing Schedule GraphQL** & **Simkl API** | For any matched show not in the calendar dump, query AniList `airingSchedule` directly. | ~150ms per item |

#### 2. AniList Airing Query (100% Free, No Cloudflare, Covers Donghua)
AniList provides the most reliable anime and donghua release data in the industry:
```typescript
const ANILIST_AIRING_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    id
    status
    episodes
    nextAiringEpisode {
      episode
      airingAt
      timeUntilAiring
    }
  }
}
`;
```
- If an entry has an `anilist_id`, we fetch its exact `nextAiringEpisode` countdown.
- If it is concluded, AniList explicitly returns `status: "FINISHED"`, so Chronicle marks the status and does not leave it in limbo.
- Covers Chinese Donghua natively without missing entries.

#### 3. Simkl TV & Anime Search API Integration
Instead of only scanning the 4-month calendar metadata, integrate the official Simkl lookup:
```typescript
// Query Simkl API directly for items missing from the static dump:
export async function searchSimklFullDatabase(query: string): Promise<SimklSearchResult[]> {
  const url = `https://api.simkl.com/search/anime?q=${encodeURIComponent(query)}&client_id=${process.env.SIMKL_CLIENT_ID}`;
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  // Also searches /search/tv for Donghua that Simkl classified as TV
  ...
}
```

---

### Solution 3: AniList Progress with Calendar Backup

AniList provides Anime and Donghua schedules. The airing-calendar API fills gaps when AniList has no schedule. Watch URLs are bookmarks; scraping stays limited to Manhwa.

#### Approach B: Scraper Proxy for Manhwa & Required Sites
For manhwa scanlation sites that require scraping (where no API exists):
Add a lightweight proxy transport adapter in `lib/trackerScraper.ts`:
```typescript
async function fetchWithBypass(url: string, options: ScrapeTrackerOptions): Promise<string> {
  const proxyKey = process.env.SCRAPER_PROXY_KEY;
  if (proxyKey) {
    // e.g., ScrapingBee or ScraperAPI
    const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${proxyKey}&url=${encodeURIComponent(url)}&render_js=false`;
    const res = await fetch(proxyUrl, { signal: options.signal });
    return res.text();
  }

  // Fallback to FlareSolverr if configured locally:
  const flareSolverrUrl = process.env.FLARESOLVERR_URL;
  if (flareSolverrUrl) {
    const res = await fetch(`${flareSolverrUrl}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: "request.get", url, maxTimeout: 15000 }),
    });
    const data = await res.json();
    return data.solution?.response || "";
  }

  // Standard fetch fallback
  return (await fetchTrackerUrlHtml(url, options)).html;
}
```

---

### Solution 4: AniList Donghua Strategy

To solve Donghua once and for all:

1. **Title Alias Equivalence Engine:**
   When searching Donghua, Chronicle normalizes and stores alternate titles:
   ```typescript
   title_aliases: {
     english: "Battle Through the Heavens",
     pinyin: "Doupo Cangqiong",
     hanzi: "斗破苍穹",
     short: "BTTH"
   }
   ```
   AniList provides English, Romaji (Pinyin), and Native (Hanzi) in a single request. Storing these on `MediaItem` ensures that whether the user searches in English or pastes a Pinyin URL, Chronicle matches instantly.
2. **Use AniList for progress:**
   AniList is primary for Donghua, with the airing-calendar API as backup. Watch URLs are bookmarks.

---

### Solution 5 & 6: Overhauling the Userflow (Making Chronicle 10x Friendlier)

Here is how we eliminate all technical complexity and normalize the user experience.

#### 1. Unified Omnisearch ("One Search to Rule Them All")
Instead of opening a blank form with 15 confusing inputs:
1. User clicks **"Add Title"** (or presses `⌘K`).
2. A clean search bar opens: *"Search anime, manhwa, donghua, or novel..."*
3. As the user types (e.g. *"Solo Leveling"*), Chronicle searches:
   - **AniList API** (for Anime & Donghua)
   - **MangaDex API** (for Manhwa & Manga)
   - **Open Library / Google Books / NovelUpdates** (for Light Novels)
4. A rich instant-results dropdown appears:

```
┌────────────────────────────────────────────────────────────────────────┐
│  🔍 Solo Leveling                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  [Poster] Solo Leveling                      MANHWA · 179 Ch · Ended   │
│  [Poster] Solo Leveling                      ANIME · 12 Ep · Ended     │
│  [Poster] Solo Leveling: ReAwakening         ANIME · Movie · 2024      │
│  [Poster] Solo Leveling (Novel)              NOVEL · 270 Ch · Ended    │
└────────────────────────────────────────────────────────────────────────┘
```

5. When the user clicks an item:
   - **Title, Type, Total Chapters/Episodes, Cover Art, AniList ID, and MangaDex ID are automatically populated.**
   - The user never sees a UUID.
   - The user never searches for a cover image URL.
   - The user never specifies whether it's Simkl or a scraper.

#### 2. Re-imagining the Modal Layout
Simplify the modal into two distinct sections: **Essentials** and **Advanced (Collapsible)**:

**Essentials (Visible to Everyone):**
- Poster & Title (auto-filled, editable)
- Status: `Active`, `Planned`, `Completed`, `On Hold`, `Dropped`
- Current Progress (Quick buttons: `+1`, slider, or direct input)
- Rating (Stars or 0–10)
- Personal Notes

**Advanced / Source Settings (Collapsed by default under "⚙️ Custom Links & Sync"):**
- Watch / Read Bookmark URL (Plain English: *"Where do you watch or read this?"*)
- Numbering Offset (only shown if continuous numbering is detected)
- Shelves selection
- Custom Cover Override

#### 3. Automatic MangaDex Integration
Remove the requirement to paste MangaDex UUIDs.
- In `app/api/media/route.ts` (or during Omnisearch selection):
  Chronicle automatically hits `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1`.
- It takes the returned ID and saves it directly to `mangadex_id`.
- The user **never has to visit MangaDex or copy IDs manually**.

#### 4. Rebranding "Tracker URL" to "Bookmark / Watch Link"
- A normal user doesn't understand "Tracker URL with Cheerio Scraper RegEx".
- Rename it to: **"Watch URL / Reading Link"** with helper text: *"Paste your reading site link here for 1-click access."*
- If the pasted link happens to match a supported scraper host (e.g., Asura Scans or Manhuafast), Chronicle silently enables automated chapter checking. If not, Chronicle gracefully keeps it as a quick-launch link and relies on MangaDex or manual increments.
- Anime and Donghua schedule failures do not appear as scraper errors.

---

## 3. Comparative Summary: Current vs. Proposed

| Feature / Workflow | Current Chronicle Implementation | Proposed Modernized Chronicle |
|---|---|---|
| **Adding an Entry** | Manual text form, manual type dropdown, manual cover URL, manual MangaDex ID hunting. | **Omnisearch Auto-complete** across AniList & MangaDex. Click to add in 3 seconds. |
| **Seasonal vs Continuous** | Clashes. Season 2 episode 1 overwrites continuous episode 25. Requires creating multiple entries. | **Automatic Episode Offset Engine** (`season_base_offset`). Supports continuous progress seamlessly. |
| **Simkl Schedules** | Static 4-month calendar dump only. Shows outside the window fail silently. | **Dual-Tier Resolver**: In-memory calendar cache + live AniList Airing GraphQL fallback. |
| **Donghua Progress** | AniList plus airing-calendar API backup; Watch URLs are bookmarks. | Keep AniList primary and calendar backup; do not scrape Donghua pages. |
| **MangaDex Integration** | User must manually copy and paste a 36-character UUID or specific URL format. | **Zero-touch**: Chronicle resolves MangaDex UUID in the background from the title automatically. |
| **Error Exposure** | Raw scraper regex errors and HTTP 403/500 codes displayed to users. | **User-friendly indicators**: "Next episode expected Friday", "Up to date", "Custom watch link saved". |

---

## 4. Phased Implementation Roadmap

### Phase 1: High-Priority Fixes (Immediate Stability)
1. **Fix Simkl Silent Drops:**
   - Update `app/api/release-radar/route.ts` and `app/api/cron/checkChapters/route.ts` to fall back to AniList GraphQL for any active Anime or Donghua that has an `anilist_id` or is missing from `simklCalendar.payload`.
   - Update Release Radar UI to display a "Schedule Pending" card for matched shows instead of hiding them completely.
2. **Keep Anime/Donghua on AniList:**
   - Use AniList for progress, with the airing-calendar API as backup.
   - Keep streaming URLs as bookmarks; reserve scraping and tracker errors for Manhwa.

### Phase 2: Core Data Engine Upgrades (Seasons & Offsets)
1. **Add `season_base_offset` to `MediaItem` schema:**
   - Allow users to enter an offset or continuous starting chapter.
   - Update `checkChapters` to compare `(remote_episode + season_base_offset) > current_progress`.
2. **Franchise / Relation Helper:**
   - Add a lightweight resolver in `lib/services/media/relations.ts` that queries AniList for prior seasons' episode counts to populate the offset automatically.

### Phase 3: UX & Omnisearch Transformation (User Delight)
1. **Omnisearch Modal (`components/OmnisearchModal.tsx`):**
   - Implement debounced multi-provider search combining AniList (Anime/Donghua) and MangaDex (Manhwa).
   - Autofill title, cover, type, total progress, and IDs upon selection.
2. **Redesign `MediaModal.tsx`:**
   - Move MangaDex ID, Tracker URL, and custom covers into a collapsed "Advanced Settings" drawer.
   - Rename "Tracker URL" to "Bookmark / Watch Link".
3. **Automated MangaDex Resolver:**
   - When a Manhwa is saved without a `mangadex_id`, perform a silent background match and persist the UUID.

---

## Conclusion & Recommendations

By addressing the underlying assumptions in Chronicle's architecture:
1. **Using AniList with an airing-calendar backup for screen media** removes brittle Anime/Donghua page scraping while preserving Manhwa tracking.
2. **Introducing an Episode Offset Bridge** solves the seasonal vs. continuous dilemma without forcing users to manage disjointed entries.
3. **Introducing an Omnisearch Auto-Complete workflow** transforms Chronicle from a "developer's scraper dashboard" into a seamless, consumer-grade media tracking experience on par with AniList and Letterboxd.
