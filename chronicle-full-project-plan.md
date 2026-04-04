# Chronicle Full Project Plan

## Summary

Chronicle is already beyond MVP: core tracking, auth, import/export, metadata lookup, bulk actions, and a scheduled chapter check all exist. The immediate need is not more surface area. The immediate need is to turn the current codebase into a shippable, maintainable, and testable product without regressing the existing feature set.

This plan covers:
1. What the project is doing now.
2. What still needs to be done.
3. The implementation order.
4. The exact technical approach for each phase.
5. The interfaces, tests, and acceptance criteria needed so implementation can proceed without further product decisions.

The recommended delivery order is:
1. Stabilize and harden the existing app.
2. Align runtime, docs, and deployment.
3. Refactor the frontend/backend structure.
4. Add missing quality gates and tests.
5. Then add the next product layer: dashboard/profile/shareable views.

## Current State

### Product status
Chronicle currently supports:
- User registration/login with JWT auth
- Media CRUD for Anime, Manhwa, Donghua, and Light Novels
- Search/filter/sort with backend querying
- Pagination
- Import/export including CSV/XLSX
- Metadata lookup via AniList/Jikan/MangaDex
- Cover caching
- Bulk actions
- Vercel cron-based chapter checks
- Telegram notifications
- Rich single-page UI in vanilla TypeScript

### Technical status
Current architecture:
- Frontend: Vite + TypeScript + `src/main.ts` monolith
- Styling: single `src/style.css`
- Backend: Vercel serverless handlers in `api/`
- Database: MongoDB via Mongoose
- Auth: JWT in `localStorage`
- Deployment target: Vercel in config, but docs still partially describe Netlify

### Known issues already confirmed
- Cron notification flow is not scoped per user and can leak combined updates
- Cron message formatting is incorrect
- CORS is configured unsafely/inconsistently
- Rate limiting is in-memory only and not production-grade for distributed serverless
- `xlsx` dependency is vulnerable
- Backend TypeScript is not properly included in `tsconfig.json`
- No formal tests
- No lint/typecheck/test scripts
- Docs and deployment instructions are out of sync
- Frontend logic is too concentrated in `src/main.ts`

## Delivery Goals

### Goal
Ship Chronicle as a secure, coherent, maintainable self-hosted media tracker with clear deployment, test coverage for critical paths, and a roadmap-ready structure for future features.

### Success criteria
The implementation is considered complete when:
- No known high-severity security/configuration issues remain
- Production and local development docs match reality
- Backend and frontend both pass automated checks
- Core flows have automated coverage
- The cron job is safe for multi-user operation
- Import/export remains functional after hardening
- `src/main.ts` is split into clear modules
- The next feature layer can be built without re-architecting again

## Execution Strategy

## Phase 1: Production Hardening

### Objective
Fix correctness, security, and deployment risks without changing product scope.

### Work items

#### 1. Fix cron architecture
Problem:
- Current cron scans all matching entries globally and sends one Telegram message, which does not match the intended per-user behavior.

Implementation:
- Introduce per-user grouping in the cron handler.
- Query matching `MediaItem`s, grouped by `user_id`.
- For each user, gather matching updates independently.
- Decide notification destination model:
  - Default choice: keep one global Telegram channel for now, but prefix each batch with the username only if a per-user destination is not yet implemented.
  - Better long-term model: add per-user notification settings to `User`.
- Recommended implementation default for this plan: add notification settings to `User` and make notifications user-specific.

Schema additions:
- `User.telegram_chat_id?: string | null`
- `User.notifications_enabled?: boolean`
- Optional future field: `User.telegram_username?: string | null`

Cron behavior:
- Only notify users with `notifications_enabled === true` and `telegram_chat_id` set.
- Format one message per user, with one line per title.
- Add hard cap per run to avoid timeouts if user/item count grows.
- Log number of users scanned, users notified, failed notifications.

Acceptance:
- No cross-user update mixing
- One user’s updates never appear in another user’s notification payload
- Cron responds with structured summary JSON

#### 2. Correct CORS/auth boundary
Problem:
- `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` is invalid and unsafe.

Implementation:
- Create a shared API response utility, e.g. `api/utils/http.ts`.
- Centralize:
  - CORS headers
  - JSON response helpers
  - OPTIONS handling
- Default policy:
  - Allow same-origin by default
  - Optional allowlist via env var, e.g. `APP_ORIGIN`
- Remove wildcard origin when credentials are enabled
- Since auth uses bearer token in headers, cookies are not required; either:
  - remove `Allow-Credentials` entirely, or
  - keep it only if a future cookie-based auth migration is planned
- Recommended default: remove `Allow-Credentials` now

Acceptance:
- Auth and media routes share one CORS implementation
- Only allowed origins are returned
- OPTIONS preflight behavior is consistent

#### 3. Replace in-memory rate limiting
Problem:
- Current limiter is per-instance memory and ineffective under distributed serverless scaling.

Implementation:
- Abstract limiter behind `RateLimiter` interface
- Add provider implementations:
  - `memory` for local/dev fallback
  - `upstash-redis` or equivalent shared store for production
- Recommended default: Upstash Redis
- Env vars:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Key strategy:
  - auth login/register by IP
  - media writes by `userId + IP`
  - cron protection by secret only, no rate limit needed unless exposed manually
- Response should include:
  - `code`
  - `message`
  - `retry_after_sec`

Acceptance:
- Shared limits work across instances
- Dev fallback still works without Redis

#### 4. Remove or isolate vulnerable spreadsheet dependency
Problem:
- `xlsx@0.18.5` has known high-severity advisories.

Implementation options:
- Preferred: replace `xlsx` with a maintained library for import/export
- If replacement is too disruptive immediately:
  - move spreadsheet parsing into a tightly validated adapter
  - restrict accepted MIME types and file sizes
  - sanitize workbook access patterns
- Recommended default for this plan: replace `xlsx` during stabilization if a compatible maintained alternative is available; otherwise isolate now and schedule swap in Phase 3

Acceptance:
- `npm audit --omit=dev` shows no unresolved high-severity production vulnerability from spreadsheet handling
- Import/export templates still work

#### 5. Strengthen input validation
Implementation:
- Replace regex-only URL validation with `new URL()` validation plus explicit `http:` / `https:` protocol check
- Add maximum lengths for:
  - `title`
  - `notes`
  - `username`
- Validate `id` query params with `ObjectId.isValid`
- Escape or normalize all user-facing notification content before Telegram HTML payload generation
- Normalize duplicate detection inputs more aggressively:
  - trim
  - collapse whitespace
  - case-insensitive match
- Add schema-level indexes to enforce intended uniqueness if desired
- Recommended default: keep duplicate-title flexibility, do not add hard unique index on media titles yet

Acceptance:
- Invalid URLs, IDs, and oversized payloads are rejected with structured 400s
- Telegram payload cannot be broken by title text

## Phase 2: Runtime, Config, and Docs Alignment

### Objective
Make the project truthful: code, docs, scripts, and deployment must agree.

### Work items

#### 1. Fix TypeScript project scope
Problem:
- `tsconfig.json` includes `netlify` even though runtime code is in `api/`

Implementation:
- Update `include` to cover `src` and `api`
- Add separate TS configs if needed:
  - `tsconfig.app.json`
  - `tsconfig.api.json`
- Recommended default: use one root config first unless Vercel build constraints force split configs

Acceptance:
- Backend files are typechecked
- No dead include paths remain

#### 2. Add quality scripts
Add to `package.json`:
- `build`
- `typecheck`
- `lint`
- `test`
- optional `test:watch`
- optional `check` as umbrella command

Recommended defaults:
- Lint: ESLint
- Test runner: Vitest
- Optional API integration tests using direct handler invocation or lightweight request simulation

Acceptance:
- One command validates the repo end to end: `npm run check`

#### 3. Update docs to Vercel reality
Implementation:
- Rewrite README to describe:
  - Vercel serverless functions
  - current local dev command
  - current env vars
  - current project structure
- Update `docs/Overview.md` to reflect actual deployment and implemented features
- Remove Netlify-specific references unless dual-deployment support is intentional
- Recommended default: standardize fully on Vercel and remove Netlify wording

Acceptance:
- New developer can clone, configure env, run locally, and deploy using only the README

#### 4. Environment contract
Define authoritative env set:
- `MONGODB_URI`
- `JWT_SECRET`
- `APP_ORIGIN`
- `CRON_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- optional `NODE_ENV`

Implementation:
- Update `.env.example`
- Add startup/config validation utility
- Fail fast when required env vars are missing in production-sensitive routes

Acceptance:
- Misconfiguration produces explicit startup/runtime error messages

## Phase 3: Frontend and Backend Refactor

### Objective
Reduce future implementation cost without changing core behavior.

## Frontend refactor plan

### Current problem
`src/main.ts` is too large and mixes:
- state
- API access
- rendering
- modal logic
- import/export
- metadata lookup
- auth
- utility functions

### Target frontend structure
Recommended module split:
- `src/main.ts` bootstrap only
- `src/state/store.ts`
- `src/api/client.ts`
- `src/api/media.ts`
- `src/api/auth.ts`
- `src/features/auth/`
- `src/features/media/`
- `src/features/import-export/`
- `src/features/lookup/`
- `src/features/dashboard/` reserved
- `src/ui/renderApp.ts`
- `src/ui/modals.ts`
- `src/ui/toast.ts`
- `src/utils/format.ts`
- `src/utils/dom.ts`
- `src/utils/validation.ts`
- `src/types/media.ts`

Refactor sequence:
1. Extract types and pure helpers first
2. Extract API client second
3. Extract auth flow third
4. Extract media rendering and modal logic fourth
5. Extract import/export and lookup fifth
6. Leave behavior unchanged during extraction
7. Add tests around pure helpers before moving riskier code

Acceptance:
- `src/main.ts` becomes a thin bootstrap/orchestration file
- No user-visible regression in existing flows

## Backend refactor plan

### Current problem
Route handlers contain repeated cross-cutting concerns:
- CORS
- auth verification
- rate limiting
- JSON response shapes
- error handling

### Target backend structure
Recommended modules:
- `api/utils/http.ts`
- `api/utils/errors.ts`
- `api/utils/config.ts`
- `api/utils/rateLimit/`
- `api/services/authService.ts`
- `api/services/mediaService.ts`
- `api/services/notificationService.ts`
- `api/services/lookupService.ts` only if server-side lookup is added later

Route shape:
- handlers become thin transport adapters
- services contain logic
- models stay in `db.ts` or move to `models/`

Acceptance:
- Route handlers mostly validate request shape, call service, return response
- Shared logic exists once

## Phase 4: Automated Testing and Verification

### Objective
Protect the current feature-rich product from regressions.

### Test stack
Recommended:
- Unit/integration: Vitest
- DOM/UI tests: Testing Library if introducing DOM-oriented modular rendering
- E2E: Playwright for critical user flows
- API integration tests: handler-level or local server tests

### Minimum required coverage areas

#### Auth
- register success
- login success
- invalid credentials
- weak password rejection
- missing JWT secret behavior
- unauthorized media access

#### Media API
- create valid entry
- reject invalid media type/status
- reject `progress_current > progress_total`
- update existing item
- delete existing item
- pagination/filter/sort behavior
- duplicate-title reject
- duplicate-title merge
- duplicate-title keep-both
- bulk insert limits
- bulk delete validation
- unauthorized access isolation by user

#### Import/export
- import valid JSON/CSV/XLSX
- malformed spreadsheet rows skipped safely
- alias header mapping works
- export schema remains stable
- malicious cell/string input does not break app

#### UI
- auth form render
- open/close modal
- add entry
- edit entry
- bulk selection
- optimistic progress increment rollback on API failure
- lookup suggestion selection
- empty state render
- load more behavior

#### Cron/notifications
- no notification when no updates
- one update message for one user
- multiple users notified separately
- disabled notifications skipped
- malformed Telegram response handled without crashing whole run

### Acceptance criteria
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run test` passes
- core Playwright smoke flow passes locally or in CI

## Phase 5: CI/CD and Release Safety

### Objective
Make future changes safe to ship.

### Work items
- Add GitHub Actions or equivalent CI pipeline
- Run on PR and main:
  - install
  - typecheck
  - lint
  - test
  - build
  - optional audit
- Add deploy gating so production deploys only happen after passing checks
- Add release checklist in docs

Recommended CI order:
1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test`
5. `npm run build`

Optional later:
- Playwright on preview deployment
- scheduled dependency audit

Acceptance:
- Every change is mechanically validated before deployment

## Phase 6: Product Completion Layer

### Objective
Add the next planned user-facing layer only after the platform is stable.

### Feature set to add
Recommended next feature set:
- Dashboard/Profile page
- Optional shareable read-only profile/list pages
- Notification settings UI
- Better stats and progress summaries
- Optional public link controls

### Dashboard scope
Include:
- totals by type
- totals by status
- average rating
- recently updated items
- stale active items
- upcoming or pending reading/watching backlog view
- notification status summary

### Shareable page scope
Recommended default:
- read-only public page
- opt-in only
- per-user visibility toggle
- no social interactions
- no comments
- no collaborative features

Required schema additions for this phase:
- `User.display_name?: string | null`
- `User.bio?: string | null`
- `User.public_profile_enabled?: boolean`
- `User.public_slug?: string | null`
- `User.avatar_url?: string | null`

Routes for this phase:
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/public/:slug`
- `GET /api/public/:slug/media`

Frontend additions:
- profile settings page
- dashboard page
- public profile viewer route

Acceptance:
- User can manage profile settings
- Public page is disabled by default
- Public page exposes only explicitly public data

## Public APIs / Interfaces / Types To Add Or Change

### Environment/config
Add or formalize:
- `APP_ORIGIN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### User model
Add:
- `notifications_enabled?: boolean`
- `telegram_chat_id?: string | null`

Future phase additions:
- `display_name?: string | null`
- `bio?: string | null`
- `public_profile_enabled?: boolean`
- `public_slug?: string | null`
- `avatar_url?: string | null`

### Shared backend utilities
Add:
- `api/utils/http.ts`
- `api/utils/config.ts`
- `api/utils/errors.ts`

### Package scripts
Add:
- `typecheck`
- `lint`
- `test`
- `check`

## Detailed Implementation Order

### Iteration 1: Hardening
1. Add shared config and HTTP helpers
2. Fix CORS
3. Fix cron user scoping and formatting
4. Add user notification fields
5. Replace/abstract rate limiter
6. Harden validation and ID handling
7. Resolve `xlsx` risk

### Iteration 2: Truth and tooling
1. Fix `tsconfig`
2. Add lint/typecheck/test scripts
3. Align README/docs/env examples
4. Add config validation

### Iteration 3: Structural refactor
1. Extract frontend types/utilities
2. Extract frontend API client
3. Extract auth/media/import/export modules
4. Extract backend services/utilities
5. Keep behavior stable while refactoring

### Iteration 4: Test coverage
1. Add unit tests for helpers and validation
2. Add API tests
3. Add UI smoke tests
4. Add cron/notification tests
5. Add CI

### Iteration 5: Product expansion
1. Dashboard
2. Profile settings
3. Notification settings UI
4. Optional public share pages

## Test Cases And Scenarios

### Security and correctness
- Request from disallowed origin is rejected or not granted permissive CORS headers
- Unauthorized user cannot read/write another user’s media
- Invalid ObjectId never reaches DB query in a way that causes cast errors
- HTML-sensitive title text cannot break Telegram message format
- Rate limit works consistently across instances when configured

### Data integrity
- Duplicate detection still works after normalization
- Bulk import handles partial failures without dropping valid rows
- Export output remains stable and machine-readable
- Refactor does not alter saved item shape

### UX regression
- Login/logout still function
- Empty state still renders correctly
- Filters/search/sort/pagination still behave the same
- Modal lookup still applies selected metadata correctly
- Optimistic `+1` still rolls back on failure

### Operational
- Cron can complete within serverless execution limits
- Missing env vars fail loudly and predictably
- CI catches type, lint, test, and build regressions

## Defaults And Assumptions

- Primary objective is to complete the whole project, not just stabilization. The plan therefore includes both hardening and feature completion, but implementation order is stabilization first.
- Vercel is the authoritative deployment target. Netlify references should be removed unless you explicitly want dual-platform support.
- JWT remains bearer-token based for now; no auth-system rewrite to cookies/sessions is included in this plan.
- MongoDB/Mongoose remains the persistence layer; no database migration is planned.
- Shareable profile/list pages are read-only and opt-in.
- Public/social/community features remain out of scope.
- Frontend framework migration is out of scope. This remains Vite + vanilla TypeScript unless explicitly re-scoped.
- Spreadsheet import/export remains a product requirement and will be preserved through dependency hardening.

## Out Of Scope For This Plan
- Rewriting the app in React/Next.js
- Mobile native apps
- Recommendations engine
- Social/community features
- Real-time sync/websockets
- Multi-tenant admin tooling
- Major database replacement

## Final Deliverable Definition

At the end of this roadmap, Chronicle should be:
- safe to deploy
- internally consistent
- documented truthfully
- covered by automated checks
- modular enough for ongoing development
- ready for dashboard/profile/shareable views without another architectural reset
