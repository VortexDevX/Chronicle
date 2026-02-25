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
- [x] Import from JSON file (with validation)

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
- [x] Inter font (Google Fonts)
- [x] Responsive layout (desktop / tablet / mobile)
- [x] Card-based media grid
- [x] Visual progress bars with percentage
- [x] Status badges with semantic colors
- [x] Relative timestamps ("2h ago", "3d ago")
- [x] Empty state (with CTA button)
- [x] Filter-aware empty state ("No matches found")
- [x] Advanced statistics dashboard (by type, status, avg rating, completion %)
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
