# Chronicle — Feature Progress

## Authentication

- [x] User registration (username + password)
- [x] User login with JWT tokens
- [x] Password hashing (bcrypt)
- [x] Protected API routes
- [x] Auto-logout on 401 (expired/invalid token)
- [x] Persistent sessions via localStorage
- [x] Inline error messages (replaces native alerts)
- [x] Loading spinner on auth buttons

## Media Management

- [x] Add new media entries
- [x] Edit existing entries
- [x] Delete entries (with styled confirmation dialog)
- [x] Track media type (Anime, Manhwa, Donghua, Light Novel)
- [x] Track status (Watching/Reading, Planned, On Hold, Dropped, Completed)
- [x] Track progress (current / total)
- [x] Quick +1 progress increment with optimistic UI
- [x] Optional rating (0–10)
- [x] Optional notes
- [x] Auto-updated "last updated" timestamp
- [x] Cover image fetching (Jikan API for Anime/Donghua)

## Data Import / Export

- [x] Export data as JSON
- [x] Export data as CSV
- [x] Export data by media type (CSV / Excel)
- [x] Import from JSON file (with validation)
- [x] Bulk import from CSV
- [x] Bulk import from Excel (.xlsx/.xls)
- [x] Header alias mapping for imports (`title/name`, `type/media_type`, etc.)
- [x] Direct MAL export import support (CSV/XLSX auto-mapping)

## Search, Filter & Sort

- [x] Search by title (debounced)
- [x] Filter by media type
- [x] Filter by status
- [x] Sort by: Recently Updated
- [x] Sort by: Progress %
- [x] Sort by: Rating
- [x] Sort by: Title A–Z

## UI / UX

- [x] Dark theme with custom design system
- [x] Chronicle visual revamp with distinct identity
- [x] Display + UI font pairing (Google Fonts)
- [x] Title typography refinement for stronger Chronicle branding
- [x] Responsive layout (desktop / tablet / mobile)
- [x] Card-based media grid
- [x] Comfortable card density polish for long-list readability
- [x] Visual progress bars with percentage
- [x] Status badges with semantic colors
- [x] Status badge contrast + shape polish
- [x] Relative timestamps ("2h ago", "3d ago")
- [x] Empty state (with CTA button)
- [x] Filter-aware empty state ("No matches found")
- [x] Advanced statistics dashboard (by type, status, avg rating)
- [x] Toast notifications (success / error)
- [x] Styled confirm dialog (replaces native confirm)
- [x] Modal with animation and focus management
- [x] Hover states on cards
- [x] Custom scrollbar
- [x] XSS protection (HTML escaping)
- [x] Stale entry indicators (14+ day warning for active entries)
- [x] SVG favicon (inline, no external files)
- [x] Cover image thumbnails (anime, lazy-loaded)
- [x] Export dropdown menu
- [x] Media metadata lookup (AniList primary + MAL fallback for Anime, Donghua, Manhwa)
- [x] Subtle emotional contrast for Completed vs Planned items
- [x] Mobile-native interaction polish (sticky header, touch sizing, FAB add action)

## Accessibility

- [x] Proper label/input associations
- [x] ARIA labels on controls
- [x] Focus management (modal, auth form)
- [x] Focus-visible outlines
- [x] prefers-reduced-motion support
- [x] aria-live region for toast notifications

## Backend / API

- [x] Netlify Functions (serverless)
- [x] MongoDB Atlas / local via Mongoose
- [x] RESTful media CRUD endpoints
- [x] JWT-based auth middleware
- [x] User-scoped data (ownership checks)
- [x] DB indexes (user_id + last_updated, user_id + media_type)

## Deployment

- [x] Vite build
- [x] Netlify hosting config
- [x] Environment variable support (MONGODB_URI, JWT_SECRET)

---

## Status Summary

- [x] All originally scoped milestones in this file are complete.

## Next Milestones (Proposed)

### Data Quality & Validation

- [x] Enforce stricter server-side validation/sanitization for media payloads
- [x] Reject invalid `progress_current > progress_total` (when total > 0)
- [x] Normalize/trim titles and prevent empty-whitespace entries

### Performance & Scale

- [x] Add pagination/infinite loading for large libraries
- [x] Move search/filter/sort to backend query params for scalability
- [x] Add request-level caching strategy for repeated cover lookups

### Reliability & Security

- [x] Add per-user/API rate limiting on auth and write routes
- [x] Add structured error payloads (`code`, `message`) across all endpoints
- [x] Add audit-safe logging and remove raw error leakage in 500 responses

### Product Features

- [x] Add duplicate-title detection with merge/keep-both flow
- [x] Add bulk actions (multi-select delete/status/progress update)
- [ ] Add Dashboard/Profile Page (Shareable too - Optional)

### Visual Identity

- [x] Full UI revamp for stronger "Chronicle" visual identity (layout, typography, color system, motion)
