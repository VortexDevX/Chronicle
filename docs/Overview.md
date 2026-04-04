# Chronicle

Chronicle is a personal media tracking web application built to manage watch and read lists across multiple formats including Anime, Manhwa, Donghua, and Light Novels.  
It exists because existing platforms are fragmented, biased, or incomplete, and because using Notepad is not a solution.

Chronicle provides a unified, format-agnostic system to track progress, status, and notes for all serialized media in one place.

---

## Problem Statement

Most tracking platforms focus heavily on anime and manga while ignoring or poorly supporting:

- Donghua
- Light Novels
- Cross-format tracking

Users are forced to:

- Use multiple platforms
- Lock data inside proprietary apps
- Manually track progress using notes or text files

Chronicle solves this by offering a single, centralized tracker with full control over data.

---

## Core Objectives

- Unified tracking for all media formats
- Simple, fast, and distraction-free UI
- Full ownership of user data
- Secure authentication
- Scalable architecture without unnecessary complexity

---

## Supported Media Types

- Anime
- Manhwa
- Donghua
- Light Novels

Each media type is treated equally with shared core fields and format-specific progress tracking.

---

## Features

### Media Management

- Add, update, and delete media entries
- Assign media type (Anime / Manhwa / Donghua / LN)
- Track status:
  - Planned
  - Watching / Reading
  - On Hold
  - Dropped
  - Completed
- Progress tracking:
  - Episode-based (Anime, Donghua)
  - Chapter/Volume-based (Manhwa, LN)
- Optional rating
- Personal notes
- Auto-updated “last updated” timestamp

### Organization & Discovery

- Search by title
- Filter by media type
- Filter by status
- Sort by last updated or progress

### Authentication

- Username + password authentication
- Username must be unique
- Password hashing (bcrypt)
- JWT-based session handling
- Protected API routes
- Stateless auth suitable for serverless deployment

### Data Control

- Export data (JSON/CSV planned)
- No third-party lock-in
- Clear data ownership

---

## Tech Stack

### Frontend

- Vite
- JavaScript / TypeScript
- HTML5, CSS3
- Fetch API for backend communication

### Backend (Serverless)

- Netlify Functions
- Node.js runtime
- REST-style API endpoints

### Database

- MongoDB Atlas
- Mongoose ODM
- Environment-based connection handling

### Auth

- JSON Web Tokens (JWT)
- bcrypt for password hashing

---

## Architecture Overview

```txt

Client (Vite Frontend)
|
v
Netlify Serverless Functions (API)
|
v
MongoDB Atlas

```

- The frontend never communicates with the database directly.
- All database access is handled by secure serverless API functions.
- Credentials are stored in environment variables.
- JWTs are issued by the backend and validated on protected routes.

---

## API Responsibilities

- User registration
- User login
- JWT generation and verification
- Media CRUD operations
- Input validation
- Ownership checks per user

---

## Deployment

### Hosting

- Frontend + Serverless Backend: Netlify
- Database: MongoDB Atlas

### Environment Variables

- MONGODB_URI
- JWT_SECRET
- NODE_ENV

---

## Data Model (High-Level)

### User

- username (unique)
- password_hash
- created_at

### MediaItem

- user_id
- title
- media_type
- status
- progress_current
- progress_total
- rating
- notes
- last_updated
- created_at

---

## Non-Goals

Chronicle intentionally avoids:

- Social features
- Public profiles
- Recommendations engine
- Community ratings
- External dependency lock-in

This is a personal tracker, not a social network.

---

## Future Enhancements

- Import from external platforms
- Cover image fetching
- Advanced statistics dashboard
- Reminder system for stalled entries
- Multi-device sync improvements
- Optional public read-only lists

---

## Philosophy

Chronicle prioritizes clarity, ownership, and long-term usability over trends or hype.  
It is designed to scale only when necessary and remain simple by default.

Build once. Track everything. Forget Notepad forever.
