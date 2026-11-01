# Lying-In Clinic Web App

A full-stack patient records management system for a lying-in maternity clinic in Sorsogon City, with patient profiling, structured SOAP consultation notes, admission and discharge of maternity patients, and auto-generated reports.

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router → **Vercel**
- **Backend**: Node.js + Express + pg (Supabase Postgres) + JWT + Helmet + Morgan → **DigitalOcean App Platform**
- **Database**: **Supabase** (managed Postgres) with an automatic local PostgreSQL failover
- **Reports and email**: cron scheduler + SMTP mailer (optional)
- **Testing**: Jest unit tests (backend)
- **Containers**: Docker / docker-compose
- **Version Control**: **GitHub** (CI/CD + deploy triggers)

## Features

### Patients and consultation

- 🔐 **JWT authentication** with role-based access (admin, doctor, staff) and login rate-limiting
- 👥 **Patient management**: search + pagination, add, edit, delete; detailed view with consultations & appointments
- 📋 **Daily Queue**: staff adds patients to the queue, doctor serves them in order
- 🩺 **Landscape Consultation**: structured SOAP notes (Subjective / Objective / Assessment / Plan) with pregnancy context banner auto-fetched from the patient's latest pregnancy, bullet/paragraph toggle for Assessment and Plan
- 🤰 **Pregnancy tracking forms**: monthly trimester sheets pre-filled from active pregnancies and saved by month/year, with auto-calculation of LMP, EDD, trimester, and OB index
- 💊 **Auto-create transactions from prescriptions**: vitamins dispensed during consultation automatically generate transaction records

### Admission and discharge (maternity inpatient workflow)

An 8-step wizard that follows the patient from admission to discharge. A sticky header on every step shows the patient, bed, allergies, active risk flags and hours since admission, with a **Refer patient** button.

| Step | What it records |
| ---- | --------------- |
| 1. Admit | Patient information pulled read-only from the profile (with an allergy alert), bed, type of admission, attending physician (dropdown), reason for admission, coverage (PhilHealth, SSS and others; None by default), arrival check-up, warning signs (history and found today), informed consent with signer (a guardian is required under 18). Referral, ICD, informant and similar fields are under "More details" |
| 2. Notes | Midwives' notes with automatic date, time, shift (in words and colour) and initials. Saved notes are locked; an administrator can correct one with a reason and the original is kept |
| 3. Vitals | Readings tagged Admission, Labor or Postpartum, colored by an early warning chart. A reading needs BP, pulse, breathing and temperature; an incomplete reading is never shown as normal. Postpartum bleeding, uterus and perineum, with a 15-minute check reminder |
| 4. Labor | Contractions per 10 minutes and duration, cervix opening, station, baby's heartbeat, water bag (clear, meconium, bloody), the time it happened for late entries, and alerts for an abnormal heartbeat, a cervix with no change, and meconium or bloody water |
| 5. Delivery | Normal spontaneous delivery only; anything abnormal opens the referral. Date and time, attendants (several, from staff), problems checklist, placenta, blood loss, perineum, oxytocin |
| 6. Baby | Live birth or stillbirth, each baby's own birth time, sex (required for a live birth), measurements, APGAR, newborn care including vitamin K, BCG, hepatitis B, screening and eye ointment. Twins supported. Low weight or low APGAR prompts a referral |
| 7. Items | Items used, each with quantity, unit, who it was used for and who recorded it; allergy warnings; void or correct with a reason; bundles; a medications-given record; PhilHealth packages (reference only); a summary sent to Transactions |
| 8. Discharge | Pre-discharge checklist, danger signs, discharge type, mother's and newborn's condition, follow-up date, death details when needed, instructions template and a printable summary |

- This module covers **normal birthing**. Signs of an abnormal birth are handled through the **referral** process. A referred stay locks Delivery, Baby and routine discharge; a doctor can reverse a referral with a reason.
- Referral-level warning signs (placenta previa, previous cesarean, twins, breech, preterm) must be referred, or the midwife records why she continues at the clinic. A normal delivery cannot be saved before that.
- Routine discharge is blocked until the baby details are saved (or a reason is recorded), the checklist is done and no warning sign is unresolved.
- Only midwives, nurses and doctors sign clinical entries. An administrator can sign only when granted "Can sign clinical entries" in Manage Users. Staff (front desk) stay read-only.
- 🧾 **Send to Transactions** passes a **summary/total only**. The system does not collect payments, issue receipts or process PhilHealth claims. A total with missing prices is shown as "Incomplete total".
- ⚙️ **Clinic Settings**: beds and prices, items with unit, charged flag and allergy class, vitamins, PhilHealth packages and a missing-prices notice.
- 🗂️ **History of changes** per admission (administrator and doctors): who changed what and when.
- Item usage is recorded for **reporting only**. There is no stock level, reorder alert or inventory page.

### Monitoring and reports

- **Monitoring** page: expected deliveries (due soon or overdue) and missed follow-ups, with contact numbers. Read-only.
- **Reports**: daily, weekly and monthly summaries now include admissions, discharges, referrals, average stay, live births, stillbirths, newborn screenings and the most-used items. The Reports page also shows admission statistics for a day, week, month, quarter or custom dates, and an item usage report with CSV export.

### Reports, security and reliability

- 📊 **Auto-generated reports**: daily, weekly, and monthly census summaries of clinic activity
- ⏰ **Automatic end-of-day reports**: a scheduler generates the daily report and (optionally) emails it to the clinic owner
- 🔒 **Role-based data access**: staff has read-only access to transactions and sees only emergency contact + pregnancy history in patient profiles
- 🎨 **Polished UI**: sage-green medical palette, responsive, accessible
- 🔄 **Auto-failover database**: local PostgreSQL backup that automatically takes over when Supabase is unreachable, with reverse-sync on recovery
- 🛡️ **Production-hardened**: Helmet CSP + HSTS, CORS, DB connect retry, `/health` endpoint, graceful errors, SPA fallback

## Still to do

These are tracked in `docs/FIX_PROGRESS.md`. Nothing below is claimed as working.

- The failover sync now covers every table, but has not been exercised against a real local PostgreSQL yet
- Live colouring of vitals while typing, and a referral button on Discharge danger signs
- Staff dropdown for the "Signed by" field of the discharge and demo midwife/doctor seed accounts
- Admit prefill from the latest consultation (assessment, plan, baseline measurements) beyond what is shown today
- A settings screen to edit bundle contents (the "Normal delivery pack" is seeded)
- Photo upload of the signed consent paper

## Capstone objectives and where they are in the system

| Objective | Where it is in the system |
| --------- | ------------------------- |
| 1. Profiling of patients | Patient management, pregnancy tracking forms |
| 2. Consultation transactions (totals/summary only, no payment) | Daily Queue, SOAP consultation, auto-created transactions, Transactions page (summary) |
| 3. Admission and discharge | 8-step Admission and Discharge wizard |
| 4. Automated reports | Daily, weekly and monthly census reports, end-of-day report |
| 5. Deploy and evaluate | Vercel + DigitalOcean deployment with CI/CD; evaluation by IT experts and end-users as part of the study |

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
> users exist yet. Treat the seeded credentials as temporary: log in and change
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
│   ├── config/clinicalThresholds.js  # clinical limits for alerts (to be confirmed by the clinic)
│   ├── middleware/           # auth, validation, role, rateLimit
│   ├── models/               # Patient, Consultation, Appointment, Report, User, PregnancyTrackingForm, ...
│   ├── routes/               # auth, patients, consultations, pregnancies, pregnancyTracking, reports, summary, admissions, clinicOptions, monitoring, ...
│   ├── services/             # summaryService, reportService (daily/weekly/monthly generation)
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
├── docs/                     # data-flow-diagram.html (DFD, Level 0 + Level 1), fix plan
├── docker-compose.yml        # API container only (DB is Supabase)
├── Dockerfile
├── .do/app.yaml              # DigitalOcean App Platform spec
├── frontend/vercel.json      # Vercel SPA routing
├── .github/workflows/ci.yml  # CI + auto-deploy (DO + Vercel)
├── package.json              # Workspace scripts
└── DEPLOYMENT.md             # Detailed deployment guide
```

The Admission and Discharge, Transactions, Clinic Settings and Referral modules have their own routes, models and pages inside these folders.

## Tests

```bash
cd backend
npm test          # jest unit tests (auth, validation, role)
```

Tests mock the data layer, so they run without a database.

## Data privacy and security

Patient records are sensitive personal health information (see the Data Privacy Act of 2012, RA 10173). Before going live:

- Change the seeded admin password and use a long random `JWT_SECRET`.
- Create separate accounts for each staff member, with the correct role.
- Serve the app over HTTPS and never set `CORS_ORIGIN` to `*`.
- Keep backups and restrict who can access the database and the clinic machine that hosts the failover database.
- Do not commit `.env` files or real patient data to the repository.

## Note on the capstone proposal

The original proposal lists the stack as **PHP + HTML/CSS/JS**. This implementation
uses **Node.js + Express + React** instead (a more modern stack that's already built
and tested). Update the proposal's "Tech Stack" slide to match:

> Frontend: React (Vite) · Backend: Node.js + Express · Database: Supabase (Postgres) with local PostgreSQL failover · Deploy: Vercel + DigitalOcean

All proposed features are implemented: patient registration, consultation records,
patient history lookup, appointment scheduling, auto-generated report generation,
including the **weekly report** and **automatic end-of-day report** described in the
proposal, and the admission and discharge of maternity patients.

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