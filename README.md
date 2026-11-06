# Chronicle

A sleek, self-hosted media tracker for **Anime**, **Manhwa**, **Donghua**, and **Light Novels** — built with Next.js App Router, React, Zustand, MongoDB, and serverless API routes.

![chronicle-preview](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![vercel](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

## ✨ Features

| Category                | Highlights                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home** | Featured story with quick logging · Recently active queue · Release updates · Activity feed |
| **Media Tracking**      | Add, edit, single delete & bulk delete · Track progress (chapters/episodes) · Quick +1 log · One-click catchup · Ratings (0–10) · Notes      |
| **Tracker Scraping**    | Automated cron checks for Manhwa and Donghua · Direct Cheerio scraping with Cloudflare reader fallback proxy · Zero external calendar dependencies |
| **Updates Inbox**       | Dedicated unread updates feed with exact chapter/episode deltas · Bulk "Mark all caught up" action · Detailed tracker error diagnostics     |
| **3D Curated Shelves**  | 3D fanned poster stack gallery cards with depth animations · Quick library entry manager modal · Media type drilldowns · Custom shelf tags   |
| **Modern Navigation**   | Context-aware TopBar · Collapsible sidebar (`Ctrl/Cmd+B`) · Five-slot mobile dock with More menu |
| **Statistics**          | Analytics dashboard with type/status breakdowns, ratings, progress totals, and recent progress activity timeline                             |
| **Import / Export**     | Full library export as JSON · Bulk JSON import to easily backup, restore, or migrate libraries                                               |
| **Discovery & Covers**  | Omnisearch discovery via AniList and MangaDex · AniList & MyAnimeList cover art · Cached cover proxy with custom URL overrides              |
| **Droppedyard**         | Dedicated "Graveyard" for dropped entries with a "Maybe Revisit" queue to filter out titles you might want to try again                      |
| **Notifications**       | Android push notifications (Firebase FCM) & Telegram bot alerts delivered when new chapters or episodes are detected                        |
| **Auth & Security**     | JWT cookie auth · bcrypt password hashing · Branded HTML account verification & password reset emails via Resend                            |
| **Design & Experience** | Shared Studio design system · Responsive layouts · Styled dropdowns and file controls · Reduced-motion support · Accessible dialogs |

## Novel reading room

The **Novels** section hosts uploaded novels, chapter reading, saved passages, favourites, and reader settings. Opening chapter 200 adds the novel to the existing Chronicle Library as **Active · Chapter 200**. Earlier chapters do not lower the saved count. Reading saves only chapter-open events, with no periodic scroll/percentage tracking or Nocturne PWA.

Administrators can import TXT/Markdown chapters or split a complete book. Files upload directly to private R2 and are verified before publication. All users can add a profile avatar from Settings. The optional `scripts/migrateNocturne.ts` utility imports only the source catalogue/chapter index, preserving original R2 objects and excluding legacy user data; it defaults to a dry run.

Reader controls include nine fonts (Book serif, Literata, Lora, Manrope, Inter, Roboto, Josefin Sans, System, Fira Code), font size, line/paragraph spacing, page width, brightness, four themes, five page tints, text alignment, continuous/paged reading, and reset defaults. Settings save to the signed-in account when **Save settings** is pressed.

Focus mode hides the reader controls and fills the viewport with text. Tap the reading canvas or press **M** to toggle it; use **Exit focus** or **Escape** to return. **S** opens settings; arrow/Page Up/Page Down keys move through text. Selecting a passage does not toggle focus.

### Upload new novels

1. Sign in with an administrator account. The migrated catalogue belongs to Vixy.
2. Open **Novels → Upload**, or go directly to `/admin/novels/upload`.
3. Enter title, author, publication status, description and genres. Add an optional JPEG/PNG/WebP cover (up to 3 MiB).
4. Choose ordered TXT/Markdown chapter files, or use **Or split a complete book** for a TXT/Markdown book with chapter headings (up to 50 MiB).
5. Optionally upload a file named exactly `titles.txt` to assign chapter titles automatically. Use one line per chapter, such as `Chapter 1: The Beginning`; `Chapter`, `Ch`, and `Ch.` prefixes with a colon, dash, or plain space are accepted. Missing entries fall back to `Chapter N` and every assigned title remains editable.
6. Review chapter titles/order and press **Publish novel**. Each chapter must contain text and be at most 3 MiB; up to 10,000 chapters are supported. Keep the page open until **Novel published** appears.

The upload screen is admin-only. Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` in the **hosting environment**, plus bucket PUT CORS for the exact site origin with `Content-Type` and `If-None-Match` allowed. Local `.env.local` does not configure Vercel. Existing titles cannot be overwritten by a new upload; retry an interrupted upload with the same metadata/files.

### Studio interface

The whole application uses the tokens in [app/studio.css](./app/studio.css), including settings, novel screens, public pages and forms. Editable logo source: `design/brand/chronicle-master.svg`; regenerate icons with `npm run icons:export`. Shelf choices are preloaded with a lightweight request and invalidated when shelves change; membership updates are atomic. Native Android sources remain local and Git-ignored.

## Public SEO page

Chronicle keeps account data private while exposing one concise, server-rendered product page to search engines and prospective users:

| Route | Search intent                                      |
| ----- | -------------------------------------------------- |
| `/`   | Combined anime, manhwa, donghua, and novel tracker |

The page summarizes all four formats without separate tracker landing pages. Technical discovery files are generated at `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, and `/llms.txt`. Private dashboard, login, and password-reset routes emit `noindex` metadata.

## 🛠️ Tech Stack

| Layer           | Technology                                                              |
| --------------- | ----------------------------------------------------------------------- |
| Frontend        | Next.js App Router · React · Zustand · CSS                              |
| Backend         | Next.js API Routes · Next.js Proxy middleware                           |
| Database        | MongoDB (Atlas or local) via Mongoose                                   |
| Auth            | JWT httpOnly cookies · bcryptjs · hashed one-time verification tokens   |
| Email           | Resend Transactional API                                                |
| Scraper Engine  | Cheerio · fetch retry/timeout helpers · Cloudflare proxy fallback       |
| Metadata APIs   | AniList GraphQL (discovery/covers) · MangaDex · MyAnimeList (fallback) |
| Notifications   | Firebase Cloud Messaging (Android) · Telegram Bot API                   |
| Testing         | Vitest · TypeScript · ESLint                                            |

## Android app

`android-app/` contains a native Android shell that reuses this deployment and UI. It adds a hardened WebView, persistent account session, native offline handling, and Firebase push alerts generated by the chapter-check cron. It does not require another application server.

Because Android uses the responsive Chronicle UI, Cron history and MangaDex URL
normalization work in both the browser and Android app without a second mobile UI.

Local Android builds use Android Studio's JDK 17 runtime: run `gradlew.bat assembleDebug assembleRelease lintDebug lintRelease` inside `android-app/`. Native Firebase push requires the local `google-services.json` for `com.vortexdevx.chronicle`. Verify notification permission, persistent login, device registration, direct push and cron-triggered push separately on a device. The current release passed builds/lint and signature checks; no device/emulator was available for launch verification.

Current downloadable release: **1.1.1**, version code **8**, **697 KB**. The APK at `public/downloads/chronicle.apk` opens `/home` on every normal launch, includes trusted-site file selection for novel/avatar uploads, and keeps notification deep links. Its signature matches the previous downloadable APK, allowing an in-place update.

## 📡 Tracker Scraping & Cron Sync

Chronicle relies strictly on direct source scraping for update checks — no external release calendar dumps, third-party schedules, or artificial season offsets:

1. **Supported Formats**:
   - **Manhwa**: Scrapes aggregator and scanlation sources (Asura, FlameComics, MangaDex, ManhuaFast, and generic chapter selectors).
   - **Donghua**: Scrapes supported video aggregators (such as AnimeXin) and generic episode lists.
   - **Anime & Light Novels**: Purely user-managed in your library with manual logging and watch/read bookmarks.
2. **Cloudflare Resilience**:
   - Direct HTTP scraping is attempted first with modern browser headers.
   - If a target site blocks serverless datacenter IPs with HTTP 403 / Cloudflare challenges, Chronicle automatically routes the request through a reader proxy to extract the latest chapter or episode number without failing.
3. **Safe Progress Contracts**:
   - Chronicle updates `latest_remote_progress` and leaves `progress_current` entirely under user control. It never auto-advances your personal reading position.
   - Fractional chapters (e.g. `10.5`) are fully preserved.
4. **Bounded Cron Budget**:
   - The cron endpoint `/api/cron/checkChapters` operates within a bounded time budget (default 24s) to fit within standard serverless timeouts. Unfinished scans rotate safely and defer to the next run without data loss.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (20.19+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)

### Setup

```bash
# Clone
git clone https://github.com/VortexDevX/Chronicle.git
cd Chronicle

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, JWT secret, etc.
```

### Environment Variables

Create a `.env.local` file:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/chronicle
JWT_SECRET=your-32-char-secret-here

# App origins (comma-separated). First origin is used in password reset emails.
APP_ORIGIN=http://localhost:3000,https://chroniclex.vercel.app

# Optional public URL fallback for metadata when no request host is available.
NEXT_PUBLIC_APP_URL=https://chroniclex.vercel.app

# Optional MyAnimeList API client ID for anime cover fallback when AniList is unavailable.
MAL_CLIENT_ID=your-myanimelist-client-id

# Transactional emails (verification & password reset)
RESEND_API_KEY=your-resend-api-key
SENDER_EMAIL=noreply@your-domain.com
SENDER_NAME="Chronicle"

# Cron protection (required in production)
CRON_SECRET=your-cron-secret

# Optional cron tuning (default 4, max 8)
CRON_CHECK_CONCURRENCY=4

# Keep response below cron-job.org's 30-second request limit (default 24000, max 25000)
CRON_TIME_BUDGET_MS=24000

# Preserve full tracker retry behavior (default 2, max 2)
CRON_SCRAPE_RETRIES=2

# Telegram notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Optional rate limiting (recommended for serverless)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run Locally

```bash
# Start the Next.js development server
npm run dev
```

Access the application at **http://localhost:3000**.

### Quality Checks

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint checks
npm run test         # Run Vitest suite
npm run build        # Production Next.js build
```

Run the checks above before pushing or opening a pull request.

### Production Notes

- Set `CRON_SECRET` in production so `/api/cron/checkChapters` rejects unauthenticated requests.
- Tune `CRON_CHECK_CONCURRENCY` if tracker notifications arrive late. Default is `4`; values above `8` are capped to avoid hammering tracker sites.
- Cron runs stop taking new tracker work before their HTTP deadline. A `200` response with `partial: true` and `deferred > 0` is healthy: deferred entries rotate by `last_attempted_at` and are retried on the next run.
- Keep `CRON_TIME_BUDGET_MS` below the scheduler timeout. Chronicle clamps it to `10000`–`25000` ms and reserves the final eight seconds for Android push and Telegram delivery.
- `CRON_SCRAPE_RETRIES=2` preserves full retry behavior. If the HTTP budget ends first, unfinished attempts rotate safely and continue on a later run.
- Configure `APP_ORIGIN` to the exact deployed origins that may call the API.
- Upstash Redis rate limiting is optional for local/single-instance installs, but recommended for serverless or horizontally scaled production. Without it, rate limits use process-local memory.
- `package.json` pins `postcss` through `overrides` so transitive tooling uses the patched 8.5.x line consistently.

### cron-job.org Chapter Check

Vercel Cron is not configured for this project. Create one job in the
[cron-job.org console](https://console.cron-job.org/) with these settings:

| Setting              | Value                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| Title                | `Chronicle 4-hour release check`                                                      |
| URL                  | `https://chroniclex.vercel.app/api/cron/checkChapters`                                |
| Enabled              | Yes                                                                                   |
| Schedule             | Every 4 hours, at minute `0` (`00:00`, `04:00`, `08:00`, `12:00`, `16:00`, `20:00`)   |
| Time zone            | `Asia/Kolkata`                                                                        |
| Request method       | `GET`                                                                                 |
| Request body         | Empty                                                                                 |
| HTTP authentication  | Disabled                                                                              |
| Custom header name   | `Authorization`                                                                       |
| Custom header value  | `Bearer <CRON_SECRET>`                                                                |
| Save response        | Disabled after setup                                                                  |
| Failure notification | Enabled                                                                               |

Run one manual test from the cron-job.org dashboard and confirm an HTTP `200` JSON response before enabling the four-hour schedule.
cron-job.org stops requests after 30 seconds. Chronicle therefore uses a bounded
24-second run, aborts in-flight tracker requests (Manhwa and Donghua) when its scan budget ends, returns partial
progress instead of timing out, and retries deferred trackers on the next run.

## 📁 Project Structure

```txt
Chronicle/
├── app/
│   ├── (dashboard)/        # Main app (Home, Library, Updates, Shelves, Droppedyard, Analytics, Cron History)
│   ├── api/                # Auth, Media, Profile, Covers, Cron, Tracker test routes
│   ├── login/              # Login, registration, and email verification
│   ├── reset-password/     # Password reset page
│   ├── globals.css         # Global CSS variables, design tokens, and utility classes
│   ├── robots.ts           # Search and AI crawler policy
│   ├── sitemap.ts          # Public canonical URL inventory
│   └── layout.tsx          # Root metadata and Next.js layout
├── components/             # Reusable UI components (Sidebar, TopBar, MediaCard, Modals)
├── hooks/                  # Custom React hooks (e.g., useAuth)
├── lib/                    # Shared utilities (DB, Auth, HTTP, Rate Limiting, Models, source adapters)
├── store/                  # Zustand state management and Cover caching
├── types/                  # TypeScript interface definitions
├── proxy.ts                # API CORS proxy using APP_ORIGIN allowlist
├── public/                 # Static assets (Favicon, icons, etc.)
└── scripts/                # Local operator utilities, including cron and data checks
```

## 📋 API Reference

| Method | Endpoint                    | Auth                 | Description                                                   |
| ------ | --------------------------- | -------------------- | ------------------------------------------------------------- |
| POST   | `/api/auth`                 | No                   | Login, register (sends verification email), or logout         |
| GET    | `/api/auth`                 | Yes                  | Current session                                               |
| POST   | `/api/auth/forgot-password` | No                   | Send Resend password reset email                              |
| POST   | `/api/auth/reset-password`  | No                   | Reset password with one-time token                            |
| POST   | `/api/auth/verify-email`    | Yes                  | Resend account verification link                              |
| GET    | `/api/auth/verify-email`    | No                   | Verify email token and redirect to dashboard                  |
| GET    | `/api/profile`              | Yes                  | Profile, recovery email, notification settings                |
| PUT    | `/api/profile`              | Yes                  | Update profile settings                                       |
| GET    | `/api/analytics`            | Yes                  | Aggregated library analytics                                  |
| GET    | `/api/media`                | Yes                  | List media with search/filter/sort/pagination                 |
| POST   | `/api/media`                | Yes                  | Create entry (single or `?bulk=1`)                            |
| PUT    | `/api/media?id=`            | Yes                  | Update entry                                                  |
| DELETE | `/api/media?id=`            | Yes                  | Delete entry                                                  |
| POST   | `/api/media?bulk_delete=1`  | Yes                  | Bulk delete media entries                                     |
| POST   | `/api/media/link`           | Yes                  | Link or unlink related entries                                |
| POST   | `/api/media/test-tracker`   | Yes                  | Test a Manhwa or Donghua tracker URL                          |
| GET    | `/api/search/unified`       | Yes                  | Omnisearch discovery for Anime, Donghua, and Manhwa           |
| GET    | `/api/cron/checkChapters`   | Bearer `CRON_SECRET` | Sync tracker progress and deliver push/Telegram notifications |
| GET    | `/api/cron/history`         | Yes                  | Inspect recent cron check runs and delivery status            |
| GET    | `/api/shelves`              | Yes                  | Fetch user shelves and custom collections                     |
| POST   | `/api/shelves`              | Yes                  | Create or update shelves                                      |
| GET    | `/api/manga-cover`          | No                   | Fetch MangaDex cover URL                                      |
| GET    | `/api/anime-cover`          | No                   | Fetch Anime/Donghua covers from AniList (with MAL fallback)   |
| GET    | `/api/image-proxy`          | No                   | Cache/proxy external cover images                             |

## 📄 License

MIT © [VortexDevX](https://github.com/VortexDevX)
