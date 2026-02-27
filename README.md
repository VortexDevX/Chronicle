# Chronicle

A sleek, self-hosted media tracker for **Anime**, **Manhwa**, **Donghua**, and **Light Novels** — built with TypeScript, Vite, and serverless functions.

![chronicle-preview](https://img.shields.io/badge/status-active-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![netlify](https://img.shields.io/badge/deploy-Netlify-00C7B7?logo=netlify)

## ✨ Features

| Category | Highlights |
|---|---|
| **Media Tracking** | Add, edit, delete entries · Track progress (episodes/chapters) · Quick +1 increment · Ratings (0–10) · Notes |
| **Smart Organization** | Server-side search/filter/sort · Pagination (`Load more`) for large libraries |
| **Statistics** | Dashboard with breakdowns by type/status · Average rating |
| **Import / Export** | Export as JSON/CSV · Export by type (CSV/XLSX) · Bulk import from JSON/CSV/Excel · Direct MAL export import (CSV/XLSX auto-mapping) |
| **Metadata Lookup** | AniList primary + MAL fallback lookup for Anime, Donghua, and Manhwa |
| **Stale Alerts** | Visual warnings on active entries not updated in 14+ days |
| **Auth** | JWT-based login/register · bcrypt password hashing · Auto-logout on token expiry |
| **Reliability** | API rate limiting on auth/write routes · Structured error payloads · Audit-safe server logs |
| **Power Features** | Duplicate-title handling (merge/keep-both) · Bulk actions (multi-select delete/status/+1 progress) |

## 🖼️ UI

- Chronicle visual identity revamp (archival, record-keeper vibe)
- Space Grotesk + Fraunces typography pairing · Responsive (mobile → desktop)
- Toast notifications · Styled confirm dialogs
- Card-based grid with progress bars, status badges, and relative timestamps
- Inline SVG favicon

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript · Vite · Vanilla CSS |
| Backend | Netlify Functions (serverless) |
| Database | MongoDB (Atlas or local) |
| Auth | JWT · bcrypt |
| APIs | AniList GraphQL · Jikan v4 (MAL fallback + cover art) |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (18+)
- [MongoDB](https://www.mongodb.com/) (local or Atlas)
- [Netlify CLI](https://docs.netlify.com/cli/) (installed via npx)

### Setup

```bash
# Clone
git clone https://github.com/VortexDevX/Chronicle.git
cd Chronicle

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

### Environment Variables

Create a `.env` file:

```env
MONGODB_URI=mongodb://localhost:27017/chronicle
JWT_SECRET=your-32-char-secret-here
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run Locally

```bash
npx netlify dev
```

Access at **http://localhost:8888**

> ⚠️ Always use port 8888 (Netlify proxy). Port 5173 serves the frontend only — API calls won't work.

### Build

```bash
npm run build
```

## 📁 Project Structure

```
Chronicle/
├── index.html              # Entry point
├── src/
│   ├── main.ts             # App logic (auth, rendering, features)
│   └── style.css           # Design system & styles
├── netlify/
│   └── functions/
│       ├── auth.ts          # Login / Register
│       ├── media.ts         # CRUD + query + bulk endpoints
│       └── utils/
│           ├── auth.ts      # JWT verification
│           ├── db.ts        # MongoDB connection & schemas
│           ├── rateLimit.ts # API rate limiter utility
│           └── log.ts       # Audit-safe structured logging
├── docs/
│   ├── PROGRESS.md          # Feature checklist
│   └── import-templates/    # CSV/XLSX templates + usage guide
├── netlify.toml             # Netlify config & API proxy
└── package.json
```

## 📋 Feature Checklist

See [docs/PROGRESS.md](docs/PROGRESS.md) for a complete feature-by-feature status.

## 🌐 Deployment

1. Push to GitHub
2. Connect repo on [Netlify](https://app.netlify.com/)
3. Set environment variables (`MONGODB_URI`, `JWT_SECRET`) in Netlify dashboard
4. Deploy — Netlify auto-builds on push

## 📄 License

MIT © [VortexDevX](https://github.com/VortexDevX)
