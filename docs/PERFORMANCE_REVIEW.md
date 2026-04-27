# Performance Review

Chronicle is a Vite/TypeScript single-page media tracker backed by Vercel API routes and MongoDB/Mongoose. The current architecture is straightforward and deployable, but several slow-production-system patterns showed up during review: UI actions sometimes update before the database confirms, repeated global refreshes hide latency instead of managing it, search has avoidable debounce delay plus an unindexed contains-regex path, and some actions provide weak progress feedback.

## Issues

- Problem: Card delete and +1 progress actions update the local UI before the API write completes.
- Cause: `src/features/media/cards.ts` performs optimistic remove/increment and then reverts on failure.
- Impact: If a tab closes, network drops, or the function times out, users can briefly see uncommitted data as real state. This violates the production requirement to avoid fake backend success.
- Fix: Keep the existing card visible, mark the specific action pending, wait for the API response, then apply the returned/confirmed state locally.

- Problem: Analytics/global stats can stay stale after add/edit/delete/status changes.
- Cause: stats refresh is TTL-gated in `src/services/media.ts`, and mutation paths often update local media without forcing stats refresh.
- Impact: Users can complete/delete/add entries and see dashboard totals lag for up to 30 seconds.
- Fix: Add a mutation helper that refreshes stats after confirmed writes and call it from create/update/delete/bulk paths.

- Problem: Search feels slower than necessary.
- Cause: the controls layer debounces input, then `setSearchTerm` adds a second debounce before fetching.
- Impact: Search waits roughly 550ms before the API request even starts, making normal typing feel sluggish.
- Fix: keep one debounce at the input boundary and make state-to-fetch immediate.

- Problem: MongoDB list queries are under-indexed for common filters/sorts.
- Cause: the schema only indexes `{ user_id, last_updated }` and `{ user_id, media_type }`.
- Impact: filtered status/type lists and title sorts can scan/sort more documents as libraries grow.
- Fix: add compound indexes for `{ user_id, status, last_updated }`, `{ user_id, media_type, status, last_updated }`, and `{ user_id, title }`.

- Problem: API list/export pages request `limit=500`, but the backend caps at 100.
- Cause: `fetchAllExportItems` asks for 500 while `/api/media` clamps to 100.
- Impact: The code is misleading and progress feedback is absent during large exports.
- Fix: request the real max page size and surface export progress/disabled button states.

- Problem: Settings modal flickers with stale/empty values.
- Cause: the modal opens immediately, then fields update after `/api/user/settings` returns.
- Impact: Users can see stale settings and may try to interact before data is loaded.
- Fix: open in an explicit loading state, disable controls, then enable once current settings are loaded.

- Problem: Loading skeletons are generic blocks.
- Cause: `renderMediaCards` renders plain rectangles instead of card-shaped placeholders.
- Impact: Perceived loading is worse and layout confidence is lower.
- Fix: render skeletons that mirror card poster/body/action structure.

- Problem: Media covers load slowly across a full page of cards.
- Cause: the cover queue processes one item at a time with a long per-item delay.
- Impact: visible covers can trickle in slowly for normal 24-item pages.
- Fix: process covers in a small concurrency-limited batch while preserving cache and external API restraint.

- Problem: Buttons can lose meaningful text while loading.
- Cause: several handlers replace button HTML with only a spinner.
- Impact: Users lose context and screen-reader feedback is weaker.
- Fix: keep action text such as `Saving...`, `Loading...`, `Exporting...`, `Updating...`, and `Deleting...` alongside the spinner.

## Key Areas

- Data fetching
  - Keep one debounce for search.
  - Avoid full refetches when a confirmed API response already returns the updated item.
  - Force stats refresh only after confirmed mutations that affect dashboard counts or ratings.

- API performance (Vercel functions)
  - Mongo connection reuse is already in place.
  - List endpoints should keep payloads paginated and indexed.
  - Export should page predictably with the backend max limit.

- Database queries (MongoDB)
  - Add compound indexes for list/filter/sort access patterns.
  - Avoid unbounded query params and keep pagination capped.
  - Consider a future normalized title/search field or Atlas Search for large libraries.

- UI/UX responsiveness
  - Use per-action loading states so only the affected card or bulk action is disabled.
  - Replace fake optimistic writes with confirmed-write updates.
  - Improve skeletons and long-running export/import feedback.

- State management
  - Track pending card actions in the store.
  - Keep local media updates, but only after API success.
  - Refresh derived stats deterministically after writes.

## Priority Fix Plan

- High
  - Remove optimistic card delete/increment behavior.
  - Add per-action pending state and non-blank loading labels.
  - Force stats refresh after confirmed create/edit/delete/status/rating mutations.
  - Add MongoDB compound indexes for common filters and sorts.

- Medium
  - Remove double debounce in search.
  - Improve settings loading state.
  - Improve export button/progress feedback.
  - Improve card skeletons.

- Low
  - Investigate bundle splitting for ExcelJS/export code.
  - Add normalized search fields or Atlas Search if libraries become large.
  - Add endpoint-level timing logs around list/export/stats routes.
