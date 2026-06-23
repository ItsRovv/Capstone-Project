# Lying-In Clinic Web App

A full-stack patient records management system for a lying-in clinic in Sorsogon City, with AI-powered note summarization and report generation.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router → **Vercel**
- **Backend**: Node.js + Express + pg (Supabase Postgres) + JWT + Helmet + Morgan → **DigitalOcean App Platform**
- **Database**: **Supabase** (managed Postgres)
- **AI**: Google Gemini for note summarization and daily report generation
- **Automation**: **n8n** on DigitalOcean Droplet
- **Version Control**: **GitHub** (CI/CD + deploy triggers)

## Features

- 🔐 **JWT authentication** with role-based access (admin, doctor, staff) and login rate-limiting
- 👥 **Patient management** — search + pagination, add, edit, delete; detailed view with consultations & appointments
- 🩺 **Consultation records** with one-click AI note summarization (`POST /api/consultations/:id/summarize`)
- 📅 **Appointment scheduling** with status tracking (scheduled / completed / cancelled)
- 📊 **AI-generated reports** — daily *and* weekly summaries of clinic activity in plain language
- ⏰ **Automatic end-of-day reports** — a scheduler generates the daily report and (optionally) emails it to the clinic owner
- 🎨 **Polished UI** — sage-green medical palette, responsive, accessible
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
#   GEMINI_API_KEY = your Google AI key

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
| `AUTOMATION_TOKEN`| Shared secret for n8n / external automation  | (required for n8n)      |
| `CORS_ORIGIN`     | Allowed origin(s), comma-separated. **Never `*`** with credentials. | `http://localhost:5173` |
| `GEMINI_API_KEY`  | Google Gemini API key                        | (required for AI)        |
| `GEMINI_MODEL`    | Gemini model id                              | `gemini-2.0-flash`       |
| `NODE_ENV`        | `development` or `production`                | `development`           |
| `REPORT_CRON`     | Cron schedule for the automatic daily report | `0 18 * * *` (6 PM)     |
| `REPORT_EMAIL`    | Recipient for the auto-generated report (blank = store only) | (empty)         |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | SMTP settings for emailing reports (all optional) | (empty) |

### `frontend/.env`

| Variable        | Description                              | Default                 |
| --------------- | ---------------------------------------- | ----------------------- |
| `VITE_API_URL`  | Base URL of the backend API              | `http://localhost:5000` |

In production, `NODE_ENV=production` causes the API server to serve the built React app from `frontend/dist` on the same port. For the split Vercel + DO architecture, set `CORS_ORIGIN` to your Vercel URL and build the frontend separately. Email and the report scheduler are **optional**: if SMTP isn't configured, the daily report is still generated and stored, just not emailed.

## Project structure

```
lying-in-clinic-web-app/
├── backend/                  # Express API
│   ├── config/db.js
│   ├── controllers/          # authController.js
│   ├── middleware/           # auth, validation, role
│   ├── models/               # Patient, Consultation, Appointment, Report, User
│   ├── routes/               # auth, patients, consultations, appointments, reports, ai
│   ├── services/             # aiService, reportService (daily/weekly generation)
│   ├── middleware/           # auth, validation, role, rateLimit
│   ├── utils/                # promptTemplates, seed, scheduler, mailer
│   ├── tests/                # jest unit tests (auth, validation, role, prompts)
│   ├── server.js
│   └── package.json
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── components/       # Layout, Sidebar, Topbar, ProtectedRoute, UI primitives
│   │   ├── contexts/         # AuthContext
│   │   ├── pages/            # Login, Register, Dashboard, Patients, PatientDetail, ...
│   │   ├── services/         # api, patientService, ...
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── database/schema.sql       # Postgres DDL (Supabase / local)
├── docker-compose.yml        # API container only (DB is Supabase)
├── Dockerfile
├── deploy/
│   └── n8n/                  # Docker Compose + workflows for n8n automation
├── .do/app.yaml              # DigitalOcean App Platform spec
├── frontend/vercel.json      # Vercel SPA routing
├── .github/workflows/ci.yml  # CI + auto-deploy (DO + Vercel)
├── package.json              # Workspace scripts
└── DEPLOYMENT.md             # Detailed deployment guide
```

## Tests

```bash
cd backend
npm test          # jest unit tests (auth, validation, role, prompt templates)
```

Tests mock the data layer, so they run without a database or API key.

## Note on the capstone proposal

The original proposal lists the stack as **PHP + HTML/CSS/JS**. This implementation
uses **Node.js + Express + React** instead (a more modern stack that's already built
and tested). Update the proposal's "Tech Stack" slide to match:

> Frontend: React (Vite) · Backend: Node.js + Express · Database: Supabase (Postgres) · AI: Google Gemini · Deploy: Vercel + DigitalOcean · Automation: n8n

All proposed features are implemented: patient registration, consultation records,
patient history lookup, appointment scheduling, the AI note summarizer, and AI
report generation — including the **weekly report** and **automatic end-of-day
report** described in the proposal.

## License

ISC
