# Chronicle

A sleek, self-hosted media tracker for **Anime**, **Manhwa**, **Donghua**, and **Light Novels** — built with Next.js App Router, React, Zustand, MongoDB, and serverless API routes.

![chronicle-preview](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![vercel](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

## ✨ Features

| Category                | Highlights                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Media Tracking**      | Add, edit, delete entries · Track progress (episodes/chapters) · Quick +1 increment · Ratings (0–10) · Notes                                    |
| **Smart Organization**  | Search/filter/sort with visible loading states · Pagination (`Load more`) · Custom shelves · Linked entries                                     |
| **Statistics**          | Analytics dashboard with type/status breakdowns, ratings, progress totals, and recent activity                                                  |
| **Import / Export**     | Full library export as JSON · Bulk import from JSON to easily restore or migrate libraries                                                      |
| **Metadata Lookup**     | AniList primary + Jikan fallback lookup for Anime/Donghua · MangaDex integration for Manhwa covers                                              |
| **High-Quality Covers** | Cached cover pipeline with batched client fetching, proxy image caching, MangaDex/AniList/Jikan support, and custom cover URL overrides         |
| **Tracker Scraping**    | Chapter/episode scraper for Manhwa and Donghua · Tracker URL testing · scrape status/error fields · Telegram update notifications                |
| **Droppedyard**         | Dedicated "Graveyard" for dropped entries, with a "Maybe Revisit" queue to filter out shows you might want to try again                         |
| **Auth**                | JWT cookie auth · bcrypt password hashing · email recovery/verification with Brevo links · session invalidation after password reset             |
| **Design System**       | Responsive, mobile-first "Soft Red" UI with sharp cards, modal scroll locking, accessible badging, skeleton cards, and animated page loaders    |
| **CORS / Deployment**   | Comma-separated `APP_ORIGIN` support · Next.js `proxy.ts` CORS handling for API routes                                                          |

## 🛠️ Tech Stack

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Frontend      | Next.js App Router · React · Zustand · CSS                                  |
| Backend       | Next.js API Routes · Next.js Proxy middleware                               |
| Database      | MongoDB (Atlas or local) via Mongoose                                       |
| Auth          | JWT httpOnly cookies · bcryptjs · hashed one-time reset tokens              |
| Email         | Brevo Transactional API                                                     |
| Scraping      | Cheerio · fetch retry/timeout helpers · host-specific scraper rules         |
| APIs          | AniList GraphQL · Jikan v4 · MangaDex · Telegram Bot API                    |
| Testing       | Vitest · TypeScript · ESLint                                                |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (20.19+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)

### Setup

```bash
# Clone
git clone https://github.com/VortexDevX/Chronicle.git
cd Chronicle

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, JWT secret, etc.
```

### Environment Variables

Create a `.env.local` file:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/chronicle
JWT_SECRET=your-32-char-secret-here

# App origins (comma-separated). First origin is used in password reset emails.
APP_ORIGIN=http://localhost:3000,https://chroniclex.vercel.app,https://chronicle.mvlab.cloud

# Optional public URL fallback for metadata when no request host is available.
NEXT_PUBLIC_APP_URL=https://chroniclex.vercel.app

# Password reset email
BREVO_API_KEY=your-brevo-api-key
BREVO_FROM_EMAIL=no-reply@your-domain.com
BREVO_FROM_NAME=Chronicle

# Cron protection (required in production)
CRON_SECRET=your-cron-secret

# Telegram notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Optional rate limiting
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run Locally

```bash
# Start the Next.js development server
npm run dev
```

Access the application at **http://localhost:3000**.

### Quality Checks

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint checks
npm run test         # Run Vitest suite
npm run build        # Production Next.js build
```

CI runs these same checks on pushes to `main` and pull requests.

### Production Notes

- Set `CRON_SECRET` in production so `/api/cron/checkChapters` rejects unauthenticated requests.
- Configure `APP_ORIGIN` to the exact deployed origins that may call the API.
- Upstash Redis rate limiting is optional for local/single-instance installs, but recommended for serverless or horizontally scaled production. Without it, rate limits use process-local memory.
- `package.json` pins `postcss` through `overrides` so transitive tooling uses the patched 8.5.x line consistently.

### Maintenance

After upgrading an existing database to the duplicate-protected media model, run:

```bash
npm run media:dedupe:backfill
```

The command fills normalized title keys for existing media rows where safe. Existing duplicate groups are reported and left for manual review.

## 📁 Project Structure

```txt
Chronicle/
├── app/
│   ├── (dashboard)/        # Main app (Library, Queue, Shelves, Droppedyard, Analytics)
│   ├── api/                # Auth, Media, Profile, Covers, Cron, Tracker test routes
│   ├── login/              # Login, registration, and forgot-password entry
│   ├── reset-password/     # Password reset page
│   ├── globals.css         # Global CSS variables, resets, and utility classes
│   └── layout.tsx          # Root Next.js layout
├── components/             # Reusable UI components (Sidebar, TopBar, MediaCard, Modals)
├── hooks/                  # Custom React hooks (e.g., useAuth)
├── lib/                    # Shared utilities (DB, Auth, HTTP, Rate Limiting, Models)
├── store/                  # Zustand state management and Cover caching
├── types/                  # TypeScript interface definitions
├── proxy.ts                # API CORS proxy using APP_ORIGIN allowlist
├── public/                 # Static assets (Favicon, etc.)
└── scripts/                # Local operator utilities, including cron and data checks
```

## 📋 API Reference

| Method | Endpoint                    | Auth | Description                                      |
| ------ | --------------------------- | ---- | ------------------------------------------------ |
| POST   | `/api/auth`                 | No   | Login, register, or logout                       |
| GET    | `/api/auth`                 | Yes  | Current session                                  |
| POST   | `/api/auth/forgot-password` | No   | Send Brevo password reset email                  |
| POST   | `/api/auth/reset-password`  | No   | Reset password with one-time token               |
| POST   | `/api/auth/verify-email`    | Yes  | Send email verification link                     |
| GET    | `/api/auth/verify-email`    | No   | Verify email token and redirect to login         |
| GET    | `/api/profile`              | Yes  | Profile, recovery email, notification settings   |
| PUT    | `/api/profile`              | Yes  | Update profile settings                          |
| GET    | `/api/analytics`            | Yes  | Aggregated library analytics                     |
| GET    | `/api/media`                | Yes  | List media with search/filter/sort/pagination    |
| POST   | `/api/media`                | Yes  | Create entry (single or `?bulk=1`)               |
| PUT    | `/api/media?id=`            | Yes  | Update entry                                     |
| DELETE | `/api/media?id=`            | Yes  | Delete entry                                     |
| POST   | `/api/media?bulk_delete=1`  | Yes  | Bulk delete                                      |
| POST   | `/api/media/link`           | Yes  | Link or unlink related entries                   |
| POST   | `/api/media/test-tracker`   | Yes  | Test a Manhwa/Donghua tracker URL                |
| GET    | `/api/cron/checkChapters`   | Bearer `CRON_SECRET` | Check tracker URLs and send Telegram updates |
| GET    | `/api/manga-cover`          | No   | Fetch MangaDex cover URL                         |
| GET    | `/api/anime-cover`          | No   | Fetch AniList/Jikan cover URL                    |
| GET    | `/api/image-proxy`          | No   | Cache/proxy external cover images                |

## 📄 License

MIT © [VortexDevX](https://github.com/VortexDevX)
