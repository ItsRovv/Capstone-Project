# Lying-In Clinic Web App

A full-stack patient records management system for a lying-in clinic in Sorsogon City, with structured SOAP consultation notes, vitamin inventory tracking, and auto-generated reports.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router → **Vercel**
- **Backend**: Node.js + Express + pg (Supabase Postgres) + JWT + Helmet + Morgan → **DigitalOcean App Platform**
- **Database**: **Supabase** (managed Postgres)
- **Version Control**: **GitHub** (CI/CD + deploy triggers)

## Features

- 🔐 **JWT authentication** with role-based access (admin, doctor, staff) and login rate-limiting
- 👥 **Patient management** — search + pagination, add, edit, delete; detailed view with consultations & appointments
- 📋 **Daily Queue** — staff adds patients to the queue, doctor serves them in order
- 🩺 **Landscape Consultation** — structured SOAP notes (Subjective / Objective / Assessment / Plan) with pregnancy context banner auto-fetched from the patient's latest pregnancy, bullet/paragraph toggle for Assessment and Plan
- 🤰 **Pregnancy tracking forms** — monthly trimester sheets pre-filled from active pregnancies and saved by month/year, with auto-calculation of LMP, EDD, trimester, and OB index
- 💊 **Auto-create transactions from prescriptions** — vitamins dispensed during consultation automatically generate transaction records
- � **Vitamin inventory tracking** — catalog and manage clinic vitamin stock through the transactions page
- �📊 **Auto-generated reports** — daily, weekly, and monthly census summaries of clinic activity
- ⏰ **Automatic end-of-day reports** — a scheduler generates the daily report and (optionally) emails it to the clinic owner
- 🔒 **Role-based data access** — staff has read-only access to transactions and sees only emergency contact + pregnancy history in patient profiles
- 🎨 **Polished UI** — sage-green medical palette, responsive, accessible
- 🔄 **Auto-failover database** — local PostgreSQL backup that automatically takes over when Supabase is unreachable, with reverse-sync on recovery
- 🛡️ **Production-hardened** — Helmet CSP + HSTS, CORS, DB connect retry, `/health` endpoint, graceful errors, SPA fallback

## Quick start (development)

```bash
# 1. Install everything
npm install --prefix backend
npm install --prefix frontend

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env:
#   DATABASE_URL = Supabase connection string (Project Settings → Database → URI)
#   JWT_SECRET   = long random string

# 3. (Optional) seed a default admin user
npm run seed
# The seeded admin's email and a generated/known password are printed to the
# console. Sign in, then change the password before going live.

# 4. Run both servers in dev mode
npm run start:dev
# Backend  → http://localhost:5000
# Frontend → http://localhost:5173
```

> **Security note:** The seed script creates a default administrator only when no
> users exist yet. Treat the seeded credentials as temporary — log in and change
> the password immediately, and never commit real credentials to the repo.

## Quick start (production / Docker)

```bash
# 1. Configure
cp .env.example .env   # see "Environment variables" below

# 2. Build & run
docker-compose up -d

# Visit http://localhost:5000
```

## Environment variables

### `backend/.env` (or root `.env` for Docker)

| Variable          | Description                                  | Default                 |
| ----------------- | -------------------------------------------- | ----------------------- |
| `PORT`            | API port                                     | `5000`                  |
| `DATABASE_URL`    | Supabase Postgres connection string          | (required)              |
| `DB_SSL`          | Force TLS on Postgres                        | `true`                  |
| `JWT_SECRET`      | Random secret for signing JWTs               | (required)              |
| `CORS_ORIGIN`     | Allowed origin(s), comma-separated. **Never `*`** with credentials. | `http://localhost:5173` |
| `NODE_ENV`        | `development` or `production`                | `development`           |
| `REPORT_CRON`     | Cron schedule for the automatic daily report | `0 18 * * *` (6 PM)     |
| `REPORT_EMAIL`    | Recipient for the auto-generated report (blank = store only) | (empty)         |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | SMTP settings for emailing reports (all optional) | (empty) |
| `FALLBACK_DB_HOST` | Local PostgreSQL host for auto-failover | `localhost` |
| `FALLBACK_DB_PORT` | Local PostgreSQL port | `5432` |
| `FALLBACK_DB_USER` | Local PostgreSQL user | `postgres` |
| `FALLBACK_DB_PASSWORD` | Local PostgreSQL password (leave blank to disable failover) | (empty) |
| `FALLBACK_DB_NAME` | Local PostgreSQL database name | `jlmc_local` |
| `FALLBACK_DB_SSL` | Use SSL for local PostgreSQL | `false` |
| `DB_AUTO_SYNC` | Auto-sync primary → fallback on startup | `true` |
| `DB_HEALTH_CHECK_INTERVAL_MS` | Health check interval (ms) | `30000` |
| `DB_HEALTH_FAIL_THRESHOLD` | Consecutive failures before failover | `3` |

### `frontend/.env`

| Variable        | Description                              | Default                 |
| --------------- | ---------------------------------------- | ----------------------- |
| `VITE_API_URL`  | Base URL of the backend API              | `http://localhost:5000` |

In production, `NODE_ENV=production` causes the API server to serve the built React app from `frontend/dist` on the same port. For the split Vercel + DO architecture, set `CORS_ORIGIN` to your Vercel URL and build the frontend separately. Email and the report scheduler are **optional**: if SMTP isn't configured, the daily report is still generated and stored, just not emailed.

## Project structure

```
lying-in-clinic-web-app/
├── backend/                  # Express API
│   ├── config/db.js          # delegates to dbManager (auto-failover)
│   ├── config/dbManager.js   # dual-pool failover manager
│   ├── controllers/          # authController.js
│   ├── middleware/           # auth, validation, role
│   ├── models/               # Patient, Consultation, Appointment, Report, User, PregnancyTrackingForm
│   ├── routes/               # auth, patients, consultations, pregnancies, pregnancyTracking, reports, summary
│   ├── services/             # summaryService, reportService (daily/weekly/monthly generation)
│   ├── middleware/           # auth, validation, role, rateLimit
│   ├── utils/                # seed, scheduler, mailer, sync
│   ├── tests/                # jest unit tests (auth, validation, role)
│   ├── server.js
│   └── package.json
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── components/       # Layout, Sidebar, Topbar, ProtectedRoute, UI primitives
│   │   ├── contexts/         # AuthContext
│   │   ├── pages/            # Login, Register, Dashboard, Patients, PatientDetail, PregnancyTrackingForm, ...
│   │   ├── services/         # api, patientService, pregnancyTrackingService, ...
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── database/schema.sql       # Postgres DDL (Supabase / local)
├── docs/data-flow-diagram.html  # DFD for title defense (Level 0 + Level 1)
├── docker-compose.yml        # API container only (DB is Supabase)
├── Dockerfile
├── .do/app.yaml              # DigitalOcean App Platform spec
├── frontend/vercel.json      # Vercel SPA routing
├── .github/workflows/ci.yml  # CI + auto-deploy (DO + Vercel)
├── package.json              # Workspace scripts
└── DEPLOYMENT.md             # Detailed deployment guide
```

## Tests

```bash
cd backend
npm test          # jest unit tests (auth, validation, role)
```

Tests mock the data layer, so they run without a database.

## Note on the capstone proposal

The original proposal lists the stack as **PHP + HTML/CSS/JS**. This implementation
uses **Node.js + Express + React** instead (a more modern stack that's already built
and tested). Update the proposal's "Tech Stack" slide to match:

> Frontend: React (Vite) · Backend: Node.js + Express · Database: Supabase (Postgres) · Deploy: Vercel + DigitalOcean

All proposed features are implemented: patient registration, consultation records,
patient history lookup, appointment scheduling, auto-generated report generation —
including the **weekly report** and **automatic end-of-day report** described in the
proposal.

## Auto-failover database (local backup)

The system supports automatic failover to a local PostgreSQL instance when Supabase is unreachable. This ensures the clinic stays operational during internet outages or Supabase downtime.

### How it works

1. On startup, the backend connects to Supabase (primary) and optionally to a local PostgreSQL database (fallback).
2. A health check pings Supabase every 30 seconds.
3. After 3 consecutive failures, all queries automatically switch to the local database.
4. The frontend shows an amber banner: "Backup database active".
5. When Supabase recovers, the system reverse-syncs local changes back to Supabase and switches back to primary.

### Setup steps

```bash
# 1. Install PostgreSQL locally on the clinic machine
#    Windows: download from https://www.postgresql.org/download/windows/
#    Remember the password you set for the postgres user.

# 2. Create the fallback database
createdb -U postgres jlmc_local
# Or via psql:
#   psql -U postgres -c "CREATE DATABASE jlmc_local;"

# 3. Configure backend/.env
#    Add the following (replace your_password with your local PG password):
#    FALLBACK_DB_HOST=localhost
#    FALLBACK_DB_PORT=5432
#    FALLBACK_DB_USER=postgres
#    FALLBACK_DB_PASSWORD=your_password
#    FALLBACK_DB_NAME=jlmc_local
#    FALLBACK_DB_SSL=false

# 4. Restart the backend
npm run start:dev
# You should see:
#   ✓ [dbManager] Connected to primary (Supabase)
#   ✓ [dbManager] Fallback (local PG) connected
#   ✓ [dbManager] Fallback schema applied
#   ✓ [sync] Snapshot complete

# 5. To test failover:
#    - Stop your internet connection or change DATABASE_URL to an invalid value
#    - After ~90 seconds (3 failed health checks), the system switches to local DB
#    - The frontend shows an amber banner
#    - Restore connection → system reverse-syncs and switches back to Supabase
```

> **Note:** If `FALLBACK_DB_PASSWORD` is left blank, failover is silently disabled and the system works exactly as before (Supabase only).

## License

ISC
