# Chronicle: Project and Operations Guide

This document describes the current implementation of Chronicle, a personal media library and novel reader. It is intended for maintainers making changes across the web app, API, database, scraper, notifications, object storage, and Android shell.

Source code and deployed configuration are authoritative. The root `README.md` is a useful product and setup overview, but portions of its cron timing and setup examples no longer match the checked-in implementation. Confirm operational values against source and the hosting/scheduler configuration before applying them.

## Product boundaries

Chronicle combines two related experiences:

- A private, account-scoped tracker for Anime, Manhwa, Donghua, and Light Novels. People manage their own progress, status, ratings, notes, covers, shelves, and activity.
- A hosted novel catalogue and reading room with chapter navigation, bookmarks, saved reader preferences, and an administrator upload workflow.

Manhwa and Donghua entries can have tracker URLs for scheduled remote progress checks. Anime and Light Novel progress is manually managed. Scraped progress is discovery information: `latest_remote_progress` is separate from the user-owned `progress_current` and must never silently advance it.

Public SEO content is a product description, not a public view of any user's collection. Do not expose account data or add fabricated library totals to public pages.

## Runtime map

```text
Browser / Android WebView
        │
        ├── Next.js App Router pages and client components
        ├── /api/* routes ── proxy.ts (CORS allowlist/preflight)
        │        ├── lib/auth.ts, guards.ts, serverSession.ts
        │        ├── lib/db.ts ── Mongoose models ── MongoDB
        │        ├── lib/services/* (media, analytics, activity, cron)
        │        ├── AniList / MangaDex / optional MAL cover lookup
        │        ├── Resend email, Telegram, Firebase push
        │        └── Cloudflare R2 presigned upload / private chapter storage
        └── scheduled GET /api/cron/checkChapters (Bearer CRON_SECRET)
                 ├── bounded selection and scraping of active Manhwa/Donghua
                 ├── update latest remote progress and check diagnostics
                 ├── persist notification baselines after successful delivery
                 └── cron history for operator visibility
```

### Main directories

| Path | Responsibility |
| --- | --- |
| `app/(dashboard)/` | Authenticated home, library, updates, shelves, analytics, novel catalogue/detail, reader, and cron history pages. |
| `app/api/` | Next.js Route Handlers for auth, profile, media, search, covers, shelves, analytics, novels, uploads, push, and cron. |
| `components/` | Shared dashboard, media, dialog, navigation, and novel UI. |
| `lib/` | Auth, database connection, HTTP/config helpers, models, provider clients, scraper, novel storage, and domain services. |
| `lib/models/` | Mongoose schemas and indexes for users, media, shelves, activity, push devices, and cron history. Novel-specific models are in `lib/novels/models/`. |
| `lib/services/` | Query and mutation logic separated from route handlers, including bounded cron work and notification state. |
| `store/`, `hooks/`, `utils/`, `types/` | Client state, reusable data hooks, pure helpers, and shared TypeScript contracts. |
| `scripts/` | Operator utilities: local cron check, migration, icon export, and optional scraper proxy. |
| `android-app/` | Local-only native Android wrapper. It is ignored by Git; see the Android section before working in it. |
| `e2e/` | Playwright studio, catalogue, and novel journey coverage. |

## Web application and request flow

Next.js App Router owns both server-rendered pages and API routes. The root `app/page.tsx` is the public product page; authenticated dashboard routes live in the route group. `proxy.ts` applies the configured CORS origin allowlist to `/api/*` and answers preflight requests. It is not an authorization layer: each protected route must still use the existing auth/guard helpers and enforce ownership in its database query.

The client uses Zustand stores and shared hooks for interactive media state. Keep server-owned decisions on the server. Media, shelves, bookmarks, reader preferences, and profile updates must be scoped to the authenticated user. Public cover proxy routes should validate remote URL/provider inputs and retain the existing safe-fetch behavior.

The common media API is `/api/media`; related route groups handle home, activity, analytics, unified discovery, profile, shelves, novels, reader preferences, uploads, and cron. Use each route's existing validation/service boundary rather than placing domain rules in UI components.

## Authentication, privacy, and outbound traffic

- Browser auth uses an `auth_token` cookie. `lib/auth.ts` verifies signed JWT claims; route guards and server session helpers are the authorization boundary. Do not treat CORS or a hidden UI control as access control.
- Registration, email verification, password reset, and session/version behavior use the existing auth models and email helpers. Keep one-time token storage and password hashes out of API responses and logs.
- User-owned records use `user_id` ownership. Preserve this scope in reads, writes, bulk operations, exports, analytics, and notification selection.
- `proxy.ts` reads the allowlist via `lib/origin.ts`; keep credentialed CORS restricted to exact allowed origins.
- External requests go through the existing fetch, timeout, retry, and validation helpers where available. Do not weaken SSRF protections or log secrets, reset tokens, JWTs, provider tokens, or full private storage URLs.
- Environment files contain credentials and are ignored. Never paste their values into this document, bug reports, command output, or commits.

## Media records and progress contract

`lib/models/MediaItem.ts` defines the core library record. Important fields include `user_id`, `media_type`, `status`, `progress_current`, `progress_total`, optional `tracker_url`, `latest_remote_progress`, scrape diagnostics, notification baselines, provider IDs, custom covers, linked entries, aliases, and optional `hosted_novel_slug`.

The schema has user-oriented indexes for listing and filtering and a partial unique index for deduplication. Preserve these invariants when changing imports or creation paths:

1. Manual `progress_current` remains user-controlled, including fractional chapter values.
2. A scrape updates the remote observation and scrape timestamps/status; it does not alter the user's current position.
3. Only eligible active Manhwa and Donghua entries with tracker URLs are scheduled.
4. Updates and exports remain user-scoped. Bulk operations must validate all submitted records and preserve existing deduplication semantics.
5. Novel reading can link a hosted catalogue novel into the existing media library. Opening a later chapter must not be undone by opening an earlier chapter.

For progress behavior, inspect `lib/services/cron/notificationState.ts`, `lib/services/media/`, route handlers, and their tests together. Do not infer notification state from the UI alone.

## Scheduled tracker checks and notifications

The handler is `app/api/cron/checkChapters/route.ts`; `scripts/checkCron.ts` is a local operator runner. Production requests must send `Authorization: Bearer <CRON_SECRET>`. In production, a missing secret is a configuration error. When a secret is configured, requests without an exact bearer match are unauthorized.

The checked-in handler currently:

- Selects up to 200 active Manhwa/Donghua entries ordered by least-recent attempt/check, and scans at most 50 users per run.
- Uses concurrency default 6, maximum 8; retry count defaults to 2 and is capped at 2. Scraper-level fetch attempts and timeouts are implemented in `lib/trackerScraper.ts`.
- Uses a 50,000 ms default time budget, clamps configured values to 10,000–55,000 ms, and reserves 6,000 ms for notification delivery. The route also declares `maxDuration = 60`.
- Aborts or defers unfinished work at the scan deadline, rotates scan fairness through attempt/check timestamps, records history, and returns explicit partial/deferred/failure counters.
- Tracks Telegram and push delivery separately. Notification baselines are advanced with bulk writes only for updates whose respective delivery succeeded; failed or deferred delivery must remain eligible for retry.

The checked-in handler values differ from the older README cron section. cron-job.org's [current FAQ](https://cron-job.org/en/faq/) says it closes requests after 30 seconds, so deployments using that scheduler should configure a lower handler budget (the README example uses 24 seconds) to leave response headroom. Before changing production schedules, confirm the deployed platform's timeout, the actual cron-job.org job and timezone, secret configuration, and current code. A successful HTTP response can still report partial work; inspect `partial`, deferred counters, failures, and cron history.

Scraping first uses direct HTTP with timeout/retry handling and source-specific parsing. Some deployments may configure the optional authenticated VPS proxy through `CHRONICLE_SCRAPER_PROXY_URL` and `CHRONICLE_SCRAPER_PROXY_KEY`; the proxy has its own service/configuration in `scripts/`. Do not bypass domain validation, request limits, or abort propagation when adding sources.

## Novel catalogue, reader, and object storage

Novel catalogue metadata and chapter records are stored through the novel models under `lib/novels/models/`. Chapter content is stored in private Cloudflare R2 objects, not copied into public static assets. `lib/novels/storage/` owns key construction, R2 access, upload client support, and object verification; `lib/novels/remote-upload.ts` coordinates the prepare/presign/complete protocol.

The upload flow is:

1. An authenticated administrator submits novel metadata and ordered chapters.
2. The server validates the request and prepares stable, non-overwriting object keys.
3. The browser PUTs files directly to R2 using short-lived presigned URLs and conditional create (`If-None-Match: *`).
4. The completion action verifies expected objects before publishing catalogue records.

Keep upload ownership/admin authorization, content type and size limits, key validation, chapter ordering, completion verification, and retry behavior in sync across UI, API, and storage. R2 PUT CORS must allow the exact site origin and required request headers. Never make private chapter objects public as a shortcut.

Reader preferences are persisted for the signed-in account when saved. Bookmarks and novel-to-library linkage are distinct from progress: preserve the existing semantics for chapter-open events and do not add scroll telemetry or periodic position recording without a product decision. Reader keyboard commands must respect editable controls and selection behavior.

## Android wrapper

Native source under `android-app/` is intentionally Git-ignored and may contain local signing or Firebase setup. Keep it local unless the user changes that policy. Use Android Studio's JDK 17 runtime as specified in the project README; do not rely on whichever Java happens to be on PATH.

The Android app wraps the responsive Chronicle site in a hardened WebView and adds native offline handling, persistent account behavior, device registration, and FCM. Validate these as separate paths: release build/lint, login persistence, notification permission, device registration, direct test push, cron-triggered push, deep-link routing, and trusted-site file selection. A Gradle build does not prove behavior on a device. Do not claim device verification unless a device/emulator journey actually ran.

`public/downloads/chronicle.apk` is an intentional published artifact allowed by `.gitignore`; its current release version/signature can change. Check the APK metadata and signature before describing a release as current.

## Configuration reference

Use `.env.example` as the safe starting point and `lib/config.ts`, provider clients, and deployment settings as the code-level source for requiredness. Typical configuration groups are:

| Purpose | Variables (names only) |
| --- | --- |
| Database and sessions | `MONGODB_URI`, `JWT_SECRET` |
| Canonical origins and email | `APP_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` |
| Scheduled job | `CRON_SECRET`, `CRON_CHECK_CONCURRENCY`, `CRON_TIME_BUDGET_MS`, `CRON_SCRAPE_RETRIES` |
| Optional discovery/rate limiting | `MAL_CLIENT_ID`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, Firebase service configuration |
| Private novel uploads | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, optional `R2_JURISDICTION` |
| Optional scrape proxy | `CHRONICLE_SCRAPER_PROXY_URL`, `CHRONICLE_SCRAPER_PROXY_KEY` |

The list is descriptive, not a declaration that every variable is required in every environment. Do not print secret values. `.env.local` configures local Next.js only; it does not configure Vercel or another host.

## Local development and checks

Requirements and package manager: use the committed root `package-lock.json`, npm, and the Node version supported by the current Next.js dependency. The project's scripts are defined in the root `package.json`:

```powershell
npm ci
npm run dev
```

Available checks and utilities:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run cron:check
npm run icons:export
```

For focused tests, use the existing Vitest or Playwright config and target the relevant test file/spec. Do not run the real cron runner against production credentials as a substitute for a fixture-based test. Full end-to-end coverage requiring real accounts, R2, FCM, email, external providers, or deployed cron should be reported separately from local unit/build results.

## Change checklist

Before changing a cross-layer feature, read this guide and follow its path through UI, route, auth/ownership, service/model, and external side effect. Inspect working-tree changes first. Preserve existing schema/data and API behavior unless a migration is deliberately designed. Add or update the narrowest relevant tests, then run applicable checks; for UI, use real desktop/mobile browser flows. For release or production claims, verify the deployed request, object, notification, Android device, or scheduler path that the claim depends on.

## Related references

- Product/setup overview and endpoint summary: [`../README.md`](../README.md)
- Shared studio tokens: [`../app/studio.css`](../app/studio.css)
- Existing design-system notes: [`design-system.md`](design-system.md)
- Android release and build procedures: Android notes in [`../README.md`](../README.md)
- Automated journeys: [`../e2e/`](../e2e/)
