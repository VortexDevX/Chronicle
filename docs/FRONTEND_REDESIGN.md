# Frontend redesign coverage

## Final direction

Paper & Lilac and Dusk & Lilac style the public pages, account, library, catalogue, reader chrome, administration, and fallbacks. Anime.js handles short entrances. Canvas strokes acknowledge successful saves. Menus, dialogs, progress bars, reader panels, and hover states have their own feedback. Theme changes reveal the new palette through three staggered manga panels.

The initial Git update used `git fetch origin main` and `git pull --ff-only origin main`; main was already current at `d2467d3`. Existing changes to AGENTS.md, README.md, and docs/CHRONICLE.md were preserved. No commit, push, deployment, or Android-native change is included.

## Map

`node scripts/mapFrontend.mjs` regenerates `FRONTEND_INVENTORY.md` with 16 page entry points, 58 TSX source files, and 331 control and activation definitions, including fallback files and shared components. Controls generated from data loops appear once with their source expressions. The map records composed components, visual hooks, event handlers, and state/ARIA attributes.

| Surface | Visual scope |
| --- | --- |
| Landing `/` | New layout with a manga collage, official art that changes with the palette, feature and format links, guest and signed-in actions, and Android download |
| `/login`, `/reset-password` | Sign in, registration, forgot password, recovery, validation, error, links, mobile branding; official Rukia artwork beside desktop sign-in |
| `/download` | APK actions, release specifications, installation cards, footer, semantic definition list |
| Home `/home` | Journal layout, featured story spread, exact progress, pause and shuffle, recent queue, weekly activity, unread releases, and reading log. Empty Home has Frieren or Rukia artwork. |
| Library `/library` | Empty/populated, all formats, grid/list, search, filters, pagination, selection, overflow actions, details, entry editor, unsaved-edit confirmation |
| `/updates` | Unread rows, fractional deltas, batch actions, empty inbox, tracker health, pending/error states |
| `/shelves` | Gallery, real cover stacks, search/sort/type, create/edit/title picker and empty collection; official Luffy postcard on the overview |
| `/droppedyard` | Empty/populated rows, restore/edit/delete actions and confirmation |
| `/analytics` | Summary, distribution bars, ratings, recent items, activity, empty/error/loading |
| `/cron-history` | Summary, filters, expandable results, pending/error/empty views |
| `/novels` | Spotlight, genre and quick filters, search, covers, add/continue actions, pagination, empty/loading/error |
| `/novels/[slug]` | Cover, description, library status, favorite, exact progress, chapters, search, pagination, unavailable state |
| `/read/[slug]/[chapter]` | Light/dark/night/AMOLED, appearance/reading options, chapters, bookmarks, focus, paged/continuous modes, controls and errors |
| `/bookmarks` | Saved passages, notes editor, delete/open actions, empty/loading/error; official Senku portrait in the empty view |
| `/admin/novels/upload` | Authorized publishing desk, file/title preview, chapter edits, progress and validation; regular-user access denial |
| Shared chrome | Expanded/collapsed sidebar, mobile drawer, bottom navigation, avatar, topbar, native dialogs, all four settings tabs, success/error toasts |
| Fallback/installation | 404, route/global error components, loaders/skeletons, offline document, OG preview, manifest and exported web icons |

## Verification

Automated source gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.

The browser suite uses 1440×1000 desktop and 390×844 touch layouts. `e2e/session.ts` creates temporary database users with real signed authentication cookies and removes their records afterwards. Admin preview checks elevate only the isolated test user and restore it in `finally`. Populated visual/failure cases intercept API responses; they do not alter the user's library.

`e2e/sakuga.spec.ts` checks theme persistence, artwork, sidebar hover, save feedback, motion preferences, and keyboard activation. It checks public pages, account settings, and populated Home in both palettes, as well as library editing, novel catalogue and details, all four reader palettes, and upload preview. WCAG A/AA checks use axe-core on the rendered pages and panels.

- Typecheck and full ESLint: passed.
- Vitest passed all 181 tests in 48 files. The production build generated 47 routes.
- Production Playwright run of `e2e/catalogue.spec.ts`, `e2e/studio.spec.ts`, `e2e/sakuga.spec.ts`, and `e2e/novels.spec.ts` passed 71 cases. One desktop case was skipped because it applies only to mobile.
- The landing page fit at 320, 360, 390, 768, 810, 1024, and 1440 pixels. Chromium loaded the character images and showed the three-panel transition. A forced fallback tested the fade, and switching themes in another tab updated the first tab.
- Favicon assets, the manifest, and the OG image returned successful responses. The ICO contains 16, 32, and 48 pixel images. The offline page used the saved dark palette.
- Sidebar checks measure both sidebar and navigation scroll widths during hover, including collapsed desktop navigation and the mobile drawer.

Production artifacts and logs are stored outside the repository in the session visualization folder. Do not commit browser traces: they can contain temporary authentication data.

## Boundaries

- R2 account/bucket credentials are absent in this local environment. Real chapter retrieval and presigned publishing cannot be verified here. Reader/catalogue UI checks use isolated chapter data; upload verification stops at local file/title preview. `e2e/novels-real.spec.ts` requires the real storage environment.
- Native Android builds, push delivery, cron delivery, deployment, and live third-party scraper responses are outside this web visual change.
- Error boundaries are wired to this installed Next.js version's `retry` API and share the verified fallback styles. A production root-layout exception was not deliberately injected.
- The UI and `public/artwork/SOURCES.md` credit the artwork from the official Black Clover, Demon Slayer, Bleach, Fire Force, One Piece Film: Red, Frieren, and Dr. Stone sites.
