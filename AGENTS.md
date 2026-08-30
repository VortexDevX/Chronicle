# Chronicle Agent Instructions

## Package Manager
- Use npm and committed `package-lock.json`: `npm install`, `npm run dev`, `npm test`.

## File-Scoped Commands
| Task | Command |
|---|---|
| Unit test | `npm test -- path/to/file.test.ts` |
| Lint file | `npx eslint path/to/file.tsx` |
| E2E case | `npx playwright test --grep "case name"` |

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

## Commit Attribution
- AI commits MUST include `Co-Authored-By: <agent model and attribution byline>`.
