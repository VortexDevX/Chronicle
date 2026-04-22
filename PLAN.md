# Chronicle — Path to 10/10

## 🎯 Goal

Transform Chronicle from a well-structured but manually-driven app into a **predictable, scalable, reactive system** without breaking Vercel deployment (API routes + cron remain untouched).

---

# 🧱 Phase 1 — Fix the Foundation (State + Rendering)

## Problem

- Manual rendering (`renderApp`, `renderStatsHost`, etc.)
- Direct state mutation (`state.xyz = ...`)
- UI easily goes out of sync

## Objective

Create a **single source of truth** with automatic UI updates.

---

## ✅ Tasks

### 1. Replace Global State

- Implement `Store` class (`src/state/core.ts`)
- Replace `state` with `store`

### 2. Enforce Immutable Updates

- Replace all:
  - `state.xyz = value`

- With:
  - `store.set(prev => ({ ...prev, xyz: value }))`

### 3. Central Render Pipeline

- Create `mountApp()` (`src/ui/root.ts`)
- Subscribe UI to store:
  - `store.subscribe(render)`

### 4. Remove Manual Rendering

- Delete ALL:
  - `renderApp()`
  - `renderStatsHost()`
  - `renderMediaCards()`

- UI must update ONLY via store

---

## ✅ Success Criteria

- No direct state mutation exists
- No manual render calls exist
- UI updates automatically after state changes

---

# ⚙️ Phase 2 — Separate Responsibilities

## Problem

Features currently:

- Fetch data
- Mutate state
- Render UI

## Objective

Each layer does ONE job.

---

## 🧩 New Structure

```
src/
├── services/   → API + business logic
├── state/      → state only
├── ui/         → rendering only
├── features/   → orchestration only
```

---

## ✅ Tasks

### 1. Create Services Layer

Example:

- `services/media.ts`
- `services/auth.ts`

Move:

- `fetchMedia`
- import/export refresh logic

---

### 2. Refactor Features

Features should:

- Call services
- NOT call API directly
- NOT mutate state directly

---

### 3. UI Purity

UI files must:

- ONLY read state (`store.get()`)
- NEVER call APIs
- NEVER mutate state

---

## ✅ Success Criteria

- No API calls inside UI files
- No state mutation inside UI
- Features only orchestrate

---

# 🔄 Phase 3 — Reactive Granularity (Performance Upgrade)

## Problem

- Entire UI re-renders on every state change

## Objective

Make updates selective.

---

## ✅ Tasks

### 1. Split Subscriptions

Instead of:

```
store.subscribe(renderAll)
```

Use:

```
store.subscribe(renderStats)
store.subscribe(renderCards)
```

---

### 2. Add Selectors (Optional but powerful)

Example:

```
const media = store.get().media;
```

Later upgrade:

- Only re-render when media changes

---

## ✅ Success Criteria

- No unnecessary full re-renders
- UI updates feel instant and efficient

---

# 🧼 Phase 4 — Error Handling Discipline

## Problem

- Silent failures (`catch {}`)

## Objective

Make errors visible and debuggable.

---

## ✅ Tasks

### 1. Replace All Silent Catches

From:

```
catch {}
```

To:

```
catch (err) {
  console.error(err);
  showToast("Something went wrong", "error");
}
```

---

### 2. Standardize API Errors

- Ensure `apiFetch` always throws structured errors

---

## ✅ Success Criteria

- No silent failures
- Errors are logged and visible to user

---

# ⚡ Phase 5 — Data Consistency & Sync

## Problem

- Multiple sources of truth (UI vs API vs state)

## Objective

State is the ONLY truth.

---

## ✅ Tasks

### 1. Always Update State After Mutations

After:

- import
- delete
- edit

Do:

```
await reloadMedia()
```

---

### 2. No Partial UI Updates

- Never manually “fix” UI pieces
- Always go through state

---

## ✅ Success Criteria

- UI never desyncs
- All data flows through store

---

# 🧠 Phase 6 — Advanced Improvements (9 → 10 jump)

## 1. Derived State

Compute things like:

- stats
- filtered media

Instead of storing them

---

## 2. Caching Layer

- Avoid unnecessary API calls
- Cache media + invalidate smartly

---

## 3. Optimistic Updates

- Update UI BEFORE API confirms
- Rollback on failure

---

## 4. Debounced Filters

- Prevent excessive re-renders

---

## 5. Type Safety Upgrade

- Replace `any` with strict types
- Enforce API contracts

---

# ☁️ Vercel Safety Checklist

## DO NOT TOUCH:

- `/api/*`
- `vercel.json`
- `cron/checkChapters.ts`

## SAFE CHANGES:

- `src/` only

---

# 🧪 Phase 7 — Testing (optional but elite)

## Add:

- Unit tests (utils, services)
- Integration tests (API layer)

---

# 🏁 Final Success Definition

You reach 10/10 when:

✔ No manual rendering
✔ No direct state mutation
✔ Clean separation of concerns
✔ Predictable data flow
✔ Zero UI desync bugs
✔ Scales without rewriting

---

# 🧊 Final Reality

Right now:

- You built a clean system
- Then controlled it manually like a puppet

This plan removes the strings.

After this:

> The system runs itself. You just define behavior.

That’s the difference between coding and engineering.
