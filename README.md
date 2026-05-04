# Chronicle

A sleek, self-hosted media tracker for **Anime**, **Manhwa**, **Donghua**, and **Light Novels** — built with Next.js App Router, React, Zustand, and MongoDB.

![chronicle-preview](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![vercel](https://img.shields.io/badge/deploy-Vercel-000?logo=vercel)

## ✨ Features

| Category               | Highlights                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Media Tracking**     | Add, edit, delete entries · Track progress (episodes/chapters) · Quick +1 increment · Ratings (0–10) · Notes                        |
| **Smart Organization** | Client-side & server-side search/filter/sort · Pagination (`Load more`) for large libraries                                         |
| **Statistics**         | Dashboard with breakdowns by type/status · Average rating                                                                           |
| **Import / Export**    | Full library export as JSON · Bulk import from JSON to easily restore or migrate libraries                                          |
| **Metadata Lookup**    | AniList primary + Jikan (MAL) fallback lookup for Anime and Donghua · MangaDex integration for Manhwa covers                        |
| **High-Quality Covers**| Proxy image fetching to cache high-resolution covers from MangaDex, AniList, and Jikan without aggressive downscaling               |
| **Droppedyard**        | Dedicated "Graveyard" for dropped entries, with a "Maybe Revisit" queue to filter out shows you might want to try again             |
| **Stale Alerts**       | Visual warnings on active entries not updated in 14+ days                                                                           |
| **Auth**               | Next.js API-based JWT authentication · bcrypt password hashing                                                                      |
| **Design System**      | Responsive, mobile-first "Soft Red" design system with instant sidebar transitions, modal scroll locking, and accessible badging    |

## 🛠️ Tech Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | Next.js 14 (App Router) · React 18 · Zustand · CSS    |
| Backend  | Next.js API Routes (Serverless)                       |
| Database | MongoDB (Atlas or local) via Mongoose                 |
| Auth     | JWT · bcryptjs                                        |
| APIs     | AniList GraphQL · Jikan v4 · MangaDex                 |
| Testing  | Vitest                                                |

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

## 📁 Project Structure

```txt
Chronicle/
├── app/
│   ├── (auth)/             # Login and Registration routes
│   ├── (dashboard)/        # Main app (Library, Queue, Shelves, Droppedyard, Analytics)
│   ├── api/                # Next.js API routes (Auth, Media, Profile, Covers, etc.)
│   ├── globals.css         # Global CSS variables, resets, and utility classes
│   └── layout.tsx          # Root Next.js layout
├── components/             # Reusable UI components (Sidebar, TopBar, MediaCard, Modals)
├── hooks/                  # Custom React hooks (e.g., useAuth)
├── lib/                    # Shared utilities (DB, Auth, HTTP, Rate Limiting, Models)
├── store/                  # Zustand state management and Cover caching
├── types/                  # TypeScript interface definitions
├── public/                 # Static assets (Favicon, etc.)
└── scripts/                # Database migration and cron check utilities
```

## 📋 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth` | No | Login or register (`action: "login"/"register"`) |
| GET | `/api/media` | Yes | List media (with search/filter/sort/pagination) |
| POST | `/api/media` | Yes | Create entry (single or `?bulk=1`) |
| PUT | `/api/media?id=` | Yes | Update entry |
| DELETE | `/api/media?id=` | Yes | Delete entry |
| POST | `/api/media?bulk_delete=1` | Yes | Bulk delete |
| GET | `/api/manga-cover` | No | Fetches proxy URLs for MangaDex covers |
| GET | `/api/anime-cover` | No | Fetches proxy URLs for AniList/Jikan covers |
| GET | `/api/image-proxy` | No | Bypasses CORS and referrer checks for external images |

## 📄 License

MIT © [VortexDevX](https://github.com/VortexDevX)
