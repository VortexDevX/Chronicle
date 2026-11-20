# Chronicle Agent Instructions

## Source of truth

- Read `docs/CHRONICLE.md` before cross-layer, data, cron, novel-storage, or release work; verify changing details against code and configuration.
- `README.md` is the user setup overview. Its cron timing table is stale relative to `app/api/cron/checkChapters/route.ts`; use the current handler values and deployed scheduler configuration.

## Package Manager

- Use npm and committed `package-lock.json`: `npm install`, `npm run dev`, `npm test`.

## File-Scoped Commands

| Task      | Command                                  |
| --------- | ---------------------------------------- |
| Unit test | `npm test -- path/to/file.test.ts`       |
| Lint file | `npx eslint path/to/file.tsx`            |
| E2E case  | `npx playwright test --grep "case name"` |

## Tracker Contracts

- `progress_current` is user-controlled; scraper writes `latest_remote_progress`. Never auto-advance manual progress.
- Preserve fractional progress and show exact unread delta/content in notifications.
- Notification state advances only after delivery succeeds; retries must not spam or lose pending updates.
- Time budgets defer/retry work; never reduce scraper coverage or silently discard trackers to fit cron timeout.
- Accept full tracker URLs where supported and normalize to stored provider IDs without breaking existing IDs.

## Auth and Public Pages

- Server-render authenticated decisions from real `auth_token` validation via existing auth utilities.
- Signed-in visitors see Home/Library paths; public SEO content must be factual and not expose a user’s private library.
- Do not add fake libraries, fabricated counts, or crawlable pages with no real content.

## Android

- `android-app/` is intentionally Git-ignored; keep it local unless user explicitly changes this policy.
- Use Android Studio/JDK 17 runtime, not system Java 25.
- Normal UI must ship in release; push labs, loops, terminals, tokens, and verbose logs stay debug-only and are removed/gated before handoff.
- Verify notification permission, persistent auth cookie, device registration, direct test push, and cron-triggered push as separate paths.

## Verification

- Web gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- UI/session work also needs desktop/mobile browser checks with signed-out and real signed-in sessions.
- Cron work needs `npm run cron:check` plus deployed endpoint/delivery proof when credentials and network permit.
- Android work needs Gradle build/lint and emulator or device launch; state exactly when no device proof exists.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
## Change workflow

- Before editing, check the project manifest and lockfile, existing project docs, real entry points, and working-tree changes relevant to the task.
- Trace any affected boundaries that exist in this project (such as UI, API, authentication, storage, jobs, and deployment); follow its architecture and contracts.
- Make the smallest complete change, preserve unrelated work and user data, and report the exact checks run and any unverified boundary.

## Git and handoff

- Commit or push only when explicitly requested. Inspect the exact diff and scan for secrets before committing.
- Use the existing Git author and committer identity. Never add AI attribution trailers or change Git identity unless explicitly requested.
- Use one concise, natural subject describing the change; do not use conventional commit prefixes or generic wording.
