# Lying-In Clinic Web App — Deployment

## Option 1: Docker Compose (recommended)

The fastest way to run the full stack. MySQL is started automatically, schema is auto-created, and the API serves both the database and the built React app on port 5000.

### Prerequisites
- Docker 20+ and Docker Compose v2
- A Google Gemini API key (for AI features)

### Steps

```bash
# 1. Configure
cp .env.example .env
# Edit .env: set DB_PASSWORD, JWT_SECRET (long random string), GEMINI_API_KEY

# 2. Build and start
docker compose up -d --build

# 3. (Optional) seed default admin
docker compose exec api npm run seed

# 4. Visit http://localhost:5000
```

### Stop / restart
```bash
docker compose down           # stop
docker compose restart        # restart services
docker compose logs -f api    # tail API logs
docker compose down -v        # nuke everything including DB volume
```

### Production notes
- **Use a managed MySQL** in production (e.g. AWS RDS, DigitalOcean Managed DB) — replace the `db` service in `docker-compose.yml` with an `external` connection and remove the volume.
- **Put the API behind a reverse proxy** (Caddy / Nginx / Cloudflare) for HTTPS termination.
- **Rotate `JWT_SECRET`** and never commit it.

---

## Option 2: Bare-metal (Node.js + MySQL + Nginx)

### Prerequisites
- Node.js 18+ on the server
- MySQL 8 server (local or managed)
- Nginx (or any reverse proxy)
- A domain pointed at the server

### Steps

```bash
# 1. Install dependencies
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# 2. Configure backend
cd ../backend
cp .env.example .env
# Edit .env — set DB_HOST (127.0.0.1 or your managed MySQL host),
# DB_USER, DB_PASSWORD, JWT_SECRET, GEMINI_API_KEY, CORS_ORIGIN, NODE_ENV=production

# 3. Initialize the database
# The backend will auto-create `lying_in_clinic` and run with the
# schema. To manually apply the reference schema:
mysql -u root -p < database/schema.sql

# 4. Seed admin
npm run seed

# 5. Run the server (use a process manager)
# Example with pm2:
npm install -g pm2
pm2 start server.js --name lying-in-clinic
pm2 save
pm2 startup
```

### Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name clinic.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then enable HTTPS with `certbot --nginx`.

---

## Database schema

The schema lives in `database/schema.sql` and is also enforced programmatically by `backend/config/db.js` (it will `CREATE DATABASE IF NOT EXISTS` on startup). Tables:

- `users` — staff accounts (admin/doctor/staff)
- `patients` — patient records
- `consultations` — visit notes (raw + AI-summarized)
- `appointments` — scheduled visits
- `clinic_reports` — generated daily reports

---

## Healthcheck

`GET /` returns `{ "status": "ok", "service": "lying-in-clinic-api" }`. Use this in your load balancer / orchestrator.

---

## Backups

For Docker, the MySQL data lives in the `db_data` volume. Snapshot it with:

```bash
docker compose exec db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" lying_in_clinic' > backup-$(date +%F).sql
```

Schedule via cron.
