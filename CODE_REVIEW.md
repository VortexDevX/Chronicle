# Chronicle Deep Code Review

## 🔴 Critical Issues

1. **Sensitive internal errors are exposed to clients in production API responses** (`api/user/settings.ts`).
   - The previous catch block returned `error.message` directly in a 500 response, which can leak DB internals, stack-adjacent details, or implementation hints.
   - This is a direct security disclosure risk on an authenticated endpoint.
   - **Status:** Fixed in this pass by replacing direct error echo with standardized generic 500 + structured server-side logging.

2. **JWT validation accepted any verified payload shape without claim hardening** (`api/_utils/auth.ts`).
   - `verifyToken` previously cast decoded payload directly and returned `decoded.userId` without runtime type guard beyond truthiness.
   - No explicit algorithm allowlist was set during verify, which weakens token verification hardening and makes assumptions implicit.
   - **Status:** Fixed in this pass by enforcing `HS256` and strict `userId` string validation.

3. **Rate limiter is fail-open on Upstash provider failures** (`api/_utils/rateLimit.ts`).
   - On provider exceptions, limiter returns `allowed: true` and full remaining quota.
   - During Redis outages, auth and write APIs can be hammered with effectively no throttling.
   - **Status:** Not fixed yet. Needs policy split (fail-closed for auth/write endpoints, optionally fail-open for low-risk read endpoints).

4. **Cron endpoint does expensive external scraping without visible request-level timeout budget** (`api/cron/checkChapters.ts`).
   - Multiple external fetches are chained; there is no uniform timeout wrapper/circuit-break policy for the whole run.
   - A few slow hosts can exhaust invocation time and produce partial/unstable behavior.
   - **Status:** Not fixed yet. Requires centralized `fetchWithTimeout + retry/backoff + host-level cooldown`.

---

## 🟡 Major Issues

1. **Layering drift: duplicated data-fetch orchestration in both `src/services/media.ts` and `src/api/media.ts`.**
   - `src/services/media.ts` is intended as business layer, but `src/api/media.ts` still contains overlapping logic and state mutations.
   - This creates hidden dependency risk and two potential behavior paths.

2. **UI rendering pipeline is still string-template monolith heavy** (`src/ui/renderApp.ts`, `src/ui/components/mediaCards.ts`).
   - Large `innerHTML` templates with intertwined rendering/business behavior make local changes risky.
   - Event behavior is split between delegated handlers and inline query lookups, increasing coupling.

3. **State selector equality strategy is expensive for object selectors** (`src/state/core.ts`).
   - Selector updates use `JSON.stringify` for object comparison.
   - This is fragile for ordering and costly under frequent state churn.

4. **Client API wrapper overwrote caller headers** (`src/api/client.ts`).
   - Call-site provided headers were discarded in favor of default headers, causing integration fragility (e.g., custom content negotiation).
   - **Status:** Fixed in this pass by explicit header normalization and merge.

5. **Type discipline is undermined in several hotspots by `any` casts** (`src/features/media/modal.ts`, `src/features/import-export/index.ts`, previous `api/user/settings.ts`).
   - This bypasses strict mode benefits and hides schema drift.

6. **Inconsistent response contracts across API routes** (`api/auth.ts`, `api/media.ts`, `api/stats.ts`, `api/user/settings.ts`).
   - Some endpoints return raw data, others return `{ ok, data }`, and error shape consistency is only partial.
   - Frontend parsing is forced to be permissive instead of strongly typed.

---

## 🔵 Minor Issues

1. **ESLint rules are effectively empty** (`eslint.config.js`).
   - Parser is configured, but no lint rules are applied.

2. **`tsconfig` weakens hygiene for dead code and parameter drift** (`tsconfig.json`).
   - `noUnusedLocals` and `noUnusedParameters` are disabled.

3. **`src/features/media/cards.ts` mixes UX orchestration and mutation logic in one listener file.**
   - Harder to test and reason about than explicit action handlers.

4. **Client-side cover queue uses direct DOM patching mixed with caching concerns** (`src/state/store.ts`).
   - Works, but combines cache lifecycle + transport + view mutation in one module.

---

## 🧠 Architecture Fix Plan

1. **Formalize boundaries**
   - `src/api/*`: transport only (HTTP request/response parsing).
   - `src/services/*`: business workflows and orchestration.
   - `src/features/*`: user-intent wiring.
   - `src/ui/*`: pure render + event binding helpers.

2. **Introduce shared DTO schemas**
   - Add runtime schema validation (e.g., Zod) in `api/_utils/validation.ts` and mirrored typed DTOs in frontend.
   - Enforce one response envelope (`{ ok, data, error }`) across all endpoints.

3. **Create backend middleware utilities**
   - `requireAuth(req)` for token extraction + typed identity.
   - `withRateLimit(policy)` wrapper for per-route controls.
   - `withErrorBoundary(handler)` for standardized errors/logging.

4. **Split UI monoliths into composable render units**
   - Break `renderDashboard` and card rendering into testable fragments.
   - Move string templates toward node builders for critical interactive blocks.

5. **Deprecate duplicated media fetch module**
   - Remove/replace `src/api/media.ts` and route all callers through `src/services/media.ts`.

---

## ⚡ Performance Fixes

1. Replace `JSON.stringify` object diff in store subscriptions with shallow compare helper for known selector shapes (`src/state/core.ts`).
2. Avoid full `container.innerHTML` rebuild for card list updates; patch changed cards by id (`src/ui/components/mediaCards.ts`).
3. Batch stats fetching with media payload or cache stats briefly client-side to cut extra request per media fetch (`src/services/media.ts`).
4. Add timeout + concurrency caps for cron scraping outbound requests (`api/cron/checkChapters.ts`).

---

## 🔐 Security Fixes

1. **Done:** Harden JWT verification by enforcing algorithm and validating `userId` claim type (`api/_utils/auth.ts`).
2. **Done:** Stop leaking raw exception messages in settings API (`api/user/settings.ts`).
3. **Needed:** Route-level rate limit policy should fail-closed for high-risk routes (`api/_utils/rateLimit.ts`, `api/auth.ts`, `api/media.ts`).
4. **Needed:** Add stricter validation for user-facing text fields and URL allowlist/host restrictions where appropriate (`api/media.ts`, `api/user/settings.ts`).
5. **Needed:** Tighten CORS fallback behavior to avoid permissive origin echoing when allowlist is absent (`api/_utils/http.ts`).

---

## 🧱 Refactor Roadmap (ORDERED)

1. **Security baseline pass**
   - finalize auth hardening, error sanitization, rate-limit fail-closed policy.
2. **Contract normalization**
   - introduce unified API response schema + frontend API typing.
3. **Backend middleware extraction**
   - auth/rate-limit/error wrappers to remove route duplication.
4. **Frontend layering cleanup**
   - remove duplicated `src/api/media.ts` workflow and centralize in service layer.
5. **Rendering decomposition**
   - split large render files, move toward partial patch updates.
6. **State/store performance tuning**
   - replace stringify equality and optimize subscription selectors.
7. **DX hardening**
   - enable meaningful ESLint rules and stricter TS unused checks.

---

## 📊 Final Scores

- **Architecture:** 5.5 / 10
- **Code Quality:** 6.0 / 10
- **Performance:** 6.0 / 10
- **Security:** 4.5 / 10
- **Overall:** 5.5 / 10

---

## Critical Fixes Started (Code-Level)

Completed in this pass:
1. `api/_utils/auth.ts`
   - Added explicit JWT algorithm allowlist (`HS256`) and strict runtime claim validation.
2. `api/user/settings.ts`
   - Removed `any`-driven response shaping.
   - Added typed payload mapper.
   - Replaced raw error echo with internal logging + generic 500 response.
3. `src/api/client.ts`
   - Added robust header normalization/merge so caller headers are preserved.

Recommended immediate next code patch:
- Add a route-level `checkRateLimitStrict` variant that fails closed on provider outage for auth/write endpoints.


## Progress Update (This Iteration)

Implemented from the roadmap with Vercel free-plan constraints in mind:

1. **Security baseline / rate-limit policy split**
   - Added `checkRateLimitStrict(...)` in `api/_utils/rateLimit.ts` to enforce fail-closed behavior when Upstash is degraded.
   - Switched high-risk write/auth routes to strict mode:
     - `api/auth.ts`
     - `api/media.ts` (POST/PUT/DELETE + bulk delete)
   - Kept default `checkRateLimit(...)` fail-open for lower-risk compatibility paths.

2. **CORS hardening for production serverless defaults**
   - Updated `api/_utils/http.ts` so production without explicit `APP_ORIGIN` no longer reflects arbitrary origins.
   - Disallowed non-allowlisted origins when allowlist is configured (returns `null`).

3. **Type/quality cleanup from roadmap**
   - Fixed `src/api/auth.ts` logout state reset by reusing `createInitialState()` to prevent AppState drift (`mediaRev` mismatch and future shape regressions).


4. **Cron resilience for serverless budget (Vercel free plan)**
   - Added `fetchWithTimeout(...)` wrapper in `api/cron/checkChapters.ts`.
   - Applied timeout-bound fetches to the external scrape calls so a few slow trackers cannot consume the whole invocation window.

5. **Frontend layering cleanup (de-duplication start)**
   - Replaced duplicated `src/api/media.ts` implementation with a compatibility shim that re-exports `fetchMedia` from `src/services/media.ts`.
   - This prevents further business-logic drift between API and service layers.


6. **Backend middleware/guard extraction (completed)**
   - Added `api/_utils/guards.ts` with:
     - `requireAuthUserId(req, res)`
     - `enforceRateLimit(req, res, options)`
   - Refactored route handlers (`api/auth.ts`, `api/media.ts`, `api/stats.ts`, `api/user/settings.ts`) to consume shared guards and reduce duplicated auth/rate-limit code paths.


7. **Performance category pass (completed)**
   - Replaced JSON-stringify selector diffing with shallow, allocation-friendly comparisons in `src/state/core.ts`.
   - Added memoized derived selectors in `src/state/selectors.ts` keyed by `mediaRev` + filter/sort state.
   - Added TTL + in-flight dedupe for stats fetching in `src/services/media.ts` to reduce redundant `/stats` calls during repeated media refreshes.


8. **DX category pass (completed)**
   - Upgraded `eslint.config.js` from parser-only to active TypeScript lint rules.
   - Added lightweight guardrails for type imports, accidental `any`, unused vars, and empty object types.
   - Added console usage guidance (`warn`/`error` allowed) to reduce noisy production logging patterns.


9. **API contract normalization pass (completed)**
   - Standardized `jsonOk/jsonError` envelopes in `api/_utils/http.ts` (`{ ok, data }` and `{ ok, error }` compatible shape).
   - Updated frontend `apiFetch` to unwrap success envelopes and parse normalized error envelopes.
   - Simplified `api/user/settings.ts` payload responses to avoid nested `ok/data` envelopes.
