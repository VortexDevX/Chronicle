# Chronicle

A sleek, self-hosted media tracker for **Anime**, **Manhwa**, **Donghua**, and **Light Novels** — built with TypeScript, Vite, and Vercel serverless functions.

![chronicle-preview](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![vercel](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

## ✨ Features

| Category               | Highlights                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Media Tracking**     | Add, edit, delete entries · Track progress (episodes/chapters) · Quick +1 increment · Ratings (0–10) · Notes                        |
| **Smart Organization** | Server-side search/filter/sort · Pagination (`Load more`) for large libraries                                                       |
| **Statistics**         | Dashboard with breakdowns by type/status · Average rating                                                                           |
| **Import / Export**    | Export as JSON/CSV/XLSX · Export by type · Bulk import from JSON/CSV/Excel · Direct MAL export import (CSV/XLSX auto-mapping)        |
| **Metadata Lookup**    | AniList primary + MAL fallback lookup for Anime, Donghua, and Manhwa                                                                |
| **Chapter Checks**     | Vercel cron-based MangaDex chapter checking · Per-user Telegram notifications                                                       |
| **Stale Alerts**       | Visual warnings on active entries not updated in 14+ days                                                                           |
| **Auth**               | JWT-based login/register · bcrypt password hashing · Auto-logout on token expiry                                                    |
| **Security**           | Centralized CORS · Origin allowlisting · Distributed rate limiting (Upstash Redis) · Input validation · Structured error payloads   |
| **Profile**            | User profile settings · Optional public shareable profile · Notification preferences                                                |
| **Power Features**     | Duplicate-title handling (merge/keep-both) · Bulk actions (multi-select delete/status/+1 progress)                                  |

## 🛠️ Tech Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | TypeScript · Vite · Vanilla CSS                       |
| Backend  | Vercel Serverless Functions                           |
| Database | MongoDB (Atlas or local) via Mongoose                 |
| Auth     | JWT · bcrypt                                          |
| APIs     | AniList GraphQL · Jikan v4 (MAL fallback + cover art) |
| Cron     | Vercel Cron (daily MangaDex chapter checks)           |
| Testing  | Vitest                                                |
| CI/CD    | GitHub Actions                                        |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (18+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- [Vercel CLI](https://vercel.com/docs/cli) (for local dev)

### Setup

```bash
# Clone
git clone https://github.com/VortexDevX/Chronicle.git
cd Chronicle

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, etc.
```

### Environment Variables

Create a `.env` file:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/chronicle
JWT_SECRET=your-32-char-secret-here

# CORS (comma-separated origins; empty = allow all in dev)
APP_ORIGIN=https://your-app.vercel.app

# Cron protection
CRON_SECRET=your-cron-secret-here

# Telegram notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-global-fallback-chat-id

# Distributed rate limiting (optional)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run Locally

```bash
# Full-stack with Vercel dev server (recommended)
npm run vercel-dev

# Frontend only (no API)
npm run dev
```

With `vercel dev`, access at **http://localhost:3000** (or whichever port Vercel assigns).

### Quality Checks

```bash
npm run typecheck    # TypeScript type checking
npm run test         # Run all tests
npm run build        # Production build
npm run check        # All checks in sequence
```

## 📁 Project Structure

```txt
Chronicle/
├── index.html              # Entry point
├── src/
│   ├── main.ts             # App bootstrap (thin — imports modules)
│   ├── style.css           # Design system & styles
│   ├── types/
│   │   └── media.ts        # Core type definitions
│   ├── state/
│   │   └── store.ts        # Application state + cover cache
│   ├── api/
│   │   ├── client.ts       # API fetch wrapper
│   │   ├── auth.ts         # Login/register/logout
│   │   └── media.ts        # Media CRUD operations
│   ├── ui/
│   │   ├── renderApp.ts    # Main render orchestration
│   │   ├── toast.ts        # Toast notifications
│   │   └── modals.ts       # Confirm dialog utility
│   ├── features/
│   │   ├── media/
│   │   │   ├── cards.ts    # Card grid rendering
│   │   │   ├── stats.ts    # Stats dashboard
│   │   │   └── modal.ts    # Add/edit modal
│   │   ├── import-export/
│   │   │   └── index.ts    # JSON/CSV/XLSX import & export
│   │   └── lookup/
│   │       └── index.ts    # AniList/MAL metadata lookup
│   └── utils/
│       ├── format.ts       # Formatting helpers
│       ├── dom.ts          # DOM utilities
│       └── validation.ts   # Data normalization
├── api/
│   ├── auth.ts             # Auth endpoint (login/register)
│   ├── media.ts            # Media CRUD + query + bulk
│   ├── profile.ts          # User profile settings
│   ├── public.ts           # Public profile viewer (read-only)
│   ├── cron/
│   │   └── checkChapters.ts # Daily MangaDex chapter check
│   └── utils/
│       ├── auth.ts         # JWT verification
│       ├── config.ts       # Environment validation
│       ├── db.ts           # MongoDB connection & schemas
│       ├── errors.ts       # Typed error classes
│       ├── http.ts         # CORS & response helpers
│       ├── log.ts          # Structured logging
│       ├── notify.ts       # Telegram notifications
│       └── rateLimit.ts    # Rate limiter (memory + Upstash)
├── tests/
│   └── utils/              # Unit tests
├── .github/workflows/
│   └── ci.yml              # GitHub Actions CI pipeline
├── vercel.json             # Vercel config + cron schedule
├── vitest.config.ts        # Test configuration
└── package.json
```

## 🌐 Deployment

1. Push to GitHub
2. Connect repo on [Vercel](https://vercel.com/)
3. Set environment variables in Vercel dashboard
4. Deploy — Vercel auto-builds on push

## 📋 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth` | No | Login or register (`action: "login"/"register"`) |
| GET | `/api/media` | Yes | List media (with search/filter/sort/pagination) |
| POST | `/api/media` | Yes | Create entry (single or `?bulk=1`) |
| PUT | `/api/media?id=` | Yes | Update entry |
| DELETE | `/api/media?id=` | Yes | Delete entry |
| POST | `/api/media?bulk_delete=1` | Yes | Bulk delete |
| GET | `/api/profile` | Yes | Get profile settings |
| PUT | `/api/profile` | Yes | Update profile settings |
| GET | `/api/public?slug=` | No | Public profile info |
| GET | `/api/public?slug=&media=1` | No | Public media list |
| GET | `/api/cron/checkChapters` | Cron | Daily chapter check |

## 📄 License

MIT © [VortexDevX](https://github.com/VortexDevX)
