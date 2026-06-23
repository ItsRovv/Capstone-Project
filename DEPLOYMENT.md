# Lying-In Clinic Web App — Deployment Guide

## Architecture

| Layer       | Technology                        | Host                    |
|-------------|-----------------------------------|-------------------------|
| Frontend    | React 18 + Vite                   | **Vercel**              |
| Backend     | Node.js + Express                 | **DigitalOcean App Platform** |
| Database    | Supabase Postgres                 | **Supabase**            |
| Automation  | n8n                               | **DigitalOcean Droplet** |
| CI/CD       | GitHub Actions                    | **GitHub**              |

---

## 1. Supabase — Database

### Create project
1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Note the **Project URL** and **API keys** (not needed for the DB layer, but useful later).
3. Go to **Project Settings → Database → Connection string → URI**.
4. Copy the **Connection pooler** URI (port `6543`).

### Apply schema
- Open the **SQL Editor** in Supabase.
- Paste the contents of `database/schema.sql` and click **Run**.
- The file is idempotent — you can re-run it safely.

---

## 2. DigitalOcean App Platform — Backend

### Prerequisites
- [DigitalOcean account](https://cloud.digitalocean.com)
- [doctl CLI](https://docs.digitalocean.com/reference/doctl/)
- GitHub repo connected to DigitalOcean Apps

### Create the app
```bash
# Install doctl and authenticate
doctl auth init

# Create from spec
doctl apps create --spec .do/app.yaml
```

### Configure secrets
In the DigitalOcean App Dashboard → Settings → Components → `api` → Environment Variables, add these as **Encrypted** secrets:
- `DATABASE_URL` — Supabase connection pooler URI
- `JWT_SECRET` — long random string (`openssl rand -hex 32`)
- `AUTOMATION_TOKEN` — long random string for n8n
- `GEMINI_API_KEY` — Google AI key (optional; falls back to local AI)

### Update CORS
Set `CORS_ORIGIN` to your Vercel frontend URL, e.g. `https://lying-in-clinic.vercel.app`.

---

## 3. Vercel — Frontend

### Deploy
1. Push your repo to GitHub.
2. Go to [vercel.com](https://vercel.com) and import the project.
3. Set **Root Directory** to `frontend`.
4. Set the build command to `npm run build` and output directory to `dist`.
5. Add environment variable:
   - `VITE_API_URL` = your DigitalOcean App Platform URL (e.g. `https://lying-in-clinic-api-xxx.ondigitalocean.app`)
6. Click **Deploy**.

### SPA routing
`frontend/vercel.json` already has the rewrite rule so client-side routes work on refresh.

---

## 4. n8n — Automation (DigitalOcean Droplet)

### Launch a Droplet
1. Create a **Basic** $6/mo Droplet with Docker pre-installed, or any Ubuntu 22.04 Droplet.
2. SSH in and install Docker + Compose plugin.

### Deploy n8n
```bash
cd /opt
git clone https://github.com/ItsRovv/Capstone-Project.git
cd Capstone-Project/deploy/n8n

cp .env.example .env
# Edit .env with your secrets:
#   N8N_BASIC_AUTH_USER / PASSWORD
#   N8N_ENCRYPTION_KEY
#   CLINIC_API_URL  (DigitalOcean App Platform URL)
#   CLINIC_AUTOMATION_TOKEN  (same as AUTOMATION_TOKEN in the API)

docker compose up -d
```

### Configure workflows
1. Visit `http://<droplet-ip>:5678` and log in with basic auth.
2. Go to **Workflows → Import from File** and upload `workflows/daily-report.json`.
3. Activate the workflow.

### Optional: put n8n behind HTTPS
Point a domain (e.g. `n8n.yourclinic.com`) at the Droplet and run a reverse proxy (Caddy or Nginx) with a free Let's Encrypt certificate.

---

## 5. GitHub — CI/CD

### Secrets to add
In your GitHub repo → Settings → Secrets and variables → Actions, add:
- `DIGITALOCEAN_ACCESS_TOKEN` — from DO API
- `DIGITALOCEAN_APP_ID` — from `doctl apps list`
- `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — from Vercel dashboard

### What happens on push
`.github/workflows/ci.yml` runs on every push/PR:
1. **Backend job** — installs deps, runs Jest tests, runs ESLint.
2. **Frontend job** — installs deps, builds, runs Vitest, runs ESLint.
3. **Deploy-backend** (only on `main`/`master`) — calls `doctl apps update`.
4. **Deploy-frontend** (only on `main`/`master`) — pushes to Vercel.

---

## 6. Local development (Docker)

The Docker Compose setup now runs only the API (no local DB). It connects to your Supabase instance via `DATABASE_URL`.

```bash
# 1. Configure
cp .env.example .env
# Edit .env: set DATABASE_URL (Supabase connection string), JWT_SECRET

# 2. Build & run
docker compose up -d --build

# 3. Visit http://localhost:5000
```

---

## 7. Healthchecks

- **API liveness**: `GET /health`
- **API readiness (DB)**: `GET /health/ready`
- **n8n automation ping**: `GET /api/automation/ping` (requires `x-automation-token`)

---

## Backups

Supabase handles automated daily backups. You can also export on demand:
```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

Schedule this via a Cron node in n8n or a server cron job.
