# Chronicle catalogue

Chronicle uses a collector's catalogue in dark mode: blue-black surfaces, pale ink, cobalt actions, and connected ruled cells. Artwork carries the colour. The layout should remain recognisable without its palette or fonts.

## Layout

- Home is an open spread: a full-cover jacket and manual-progress stamp beside a numbered recent-activity queue. Every 30 seconds the jacket requests a fresh random draw from the user's entire active collection, excluding the current title when another is available. There is no fixed batch, cycling order, or total-position counter. Pause and shuffle controls support manual browsing. Interaction, open panels, pending saves, and hidden tabs stop automatic changes; a failed draw preserves the visible story. The recent queue stays stable. On mobile the jacket becomes a cover-and-record pair, followed by the same queue. Never replace it with a faded background banner.
- Library is a connected cover register, with direct format tabs and a shared query/view/selection toolbar. Cell numbers describe position in the current result order, not permanent collection IDs.
- Shelves show straight strips of real collection covers. Releases and activity use ruled rows. Charts retain meaningful semantic colours.
- Barlow Condensed gives headings their compact shape. IBM Plex Sans handles reading and controls. System monospace labels identify order and exact progress. Avoid large editorial slogans in private task screens.
- Keep backgrounds flat, corners square, and borders shared. Solid cobalt means navigation or action; pale blue keeps progress and links legible on dark surfaces. Error and delivery states retain their own semantics.

## Shared implementation

- `app/catalogue.css` owns current design tokens and feature refinements. It loads after legacy feature styles. Prefer changing these tokens or component rules over adding inline styles.
- `next/font` self-hosts Barlow Condensed and IBM Plex Sans.
- `Brand` supplies the shared page-edge C mark and wordmark. The same source produces browser, PWA, and native launcher icons through `npm run icons:export`; see `design/brand/README.md`.
- `Dialog` supplies native modal/background semantics, keyboard wrapping, return focus, scroll locking, reduced-motion exit, and optional unsaved-edit confirmation. Use it for new panels rather than hand-built modal overlays.
- `MediaCard` keeps title, manual progress, and actions available in grid and list. Cover opens `MediaDetails`; management actions live in overflow.
- `progressSummary` distinguishes known completion totals from latest tracker availability. `unreadDelta` preserves decimal differences without display artifacts. Never show unknown-total progress as a completion percentage.

## Interaction rules

- Manual progress only changes after explicit user action. Tracker updates remain separate.
- Failed saves revert optimistic presentation. Saved feedback appears only after persistence succeeds.
- Routine +1 actions use local acknowledgment. Errors remain dismissible until the user has time to read them.
- Keep core touch controls at least 44px tall, card titles at least 14px, and progress text at least 13px.
- Animate small state changes once. No permanent unread pulse. Cover strips lift briefly on hover or keyboard focus; saved progress acknowledges only successful persistence.
- Respect reduced motion. Preserve loading/saved/error information when animation is disabled.
- Keep private library data out of public pages. Public navigation uses existing server auth validation.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

After a production build, `npm run test:e2e` starts a local server on port 3101 and runs desktop/mobile interaction regressions. Browser fixtures intercept all API requests and reject mutations. Set `PLAYWRIGHT_BASE_URL` to use an existing local server instead.

For UI work, also inspect real signed-in and signed-out desktop/mobile sessions. Use failure simulations rather than modifying a user's real progress during checks.
