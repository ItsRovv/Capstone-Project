const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

const patientRoutes = require('./routes/patients');
const consultationRoutes = require('./routes/consultations');
const appointmentRoutes = require('./routes/appointments');
const reportRoutes = require('./routes/reports');
const aiRoutes = require('./routes/aiRoutes');
const authRoutes = require('./routes/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const { startScheduler } = require('./utils/scheduler');
const db = require('./config/db');

dotenv.config();

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Refuse to start in production with a missing or placeholder JWT secret.
const WEAK_SECRETS = new Set(['', 'replace-with-a-long-random-string', 'change-me-in-prod', 'secret']);
if (NODE_ENV === 'production') {
  const s = process.env.JWT_SECRET || '';
  if (!s || WEAK_SECRETS.has(s) || s.length < 32) {
    console.error('FATAL: JWT_SECRET is missing, too short (<32 chars), or a placeholder. Set a strong secret in your .env before running in production.');
    process.exit(1);
  }
}

const app = express();

// Trust the first proxy hop (needed for correct client IPs behind nginx/Docker,
// which makes express-rate-limit accurate).
app.set('trust proxy', 1);

// Security headers. A real CSP is configured (instead of disabling it) so the
// built SPA — which loads Google Fonts — keeps working while staying protected.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", ...CORS_ORIGIN.split(',').map((s) => s.trim())],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Force HTTPS for a year in production (ignored over plain HTTP in dev).
    hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false
  })
);

app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true // required so cookies are forwarded cross-origin
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Request logging: concise colourised output in dev, Apache "combined" format in
// production so logs are parseable by aggregators (CloudWatch, Loki, Render logs…).
// Health probes are skipped to avoid flooding logs with orchestrator pings.
const skipHealth = (req) => req.url === '/health' || req.url === '/health/ready';
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev', { skip: skipHealth }));

// Liveness probe — process is up. Used by docker-compose / load balancers.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lying-in-clinic-api', uptime: process.uptime() });
});

// Readiness probe — process is up AND the database is reachable. Orchestrators
// (Render, k8s) should route traffic only once this returns 200.
app.get('/health/ready', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ready', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', db: 'down', error: err.message });
  }
});

// Root info endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'lying-in-clinic-api' });
});

// API routes — auth gets a stricter limiter; everything else a general one.
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter);
app.use('/api/patients', patientRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ai', aiRoutes);

// Serve frontend in production
if (NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distPath));
  // SPA fallback for non-API routes
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 for unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error('[Error]', err.stack || err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Something went wrong!',
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Only start listening when run directly (so tests can import `app`).
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT} (${NODE_ENV})`);
    // Kick off the automatic end-of-day report scheduler.
    startScheduler();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Is the server already running?`);
    } else {
      console.error('Failed to start server:', err);
    }
    process.exit(1);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Cloud platforms (Render, k8s, Docker) send SIGTERM before stopping a
  // container. Stop accepting new connections, drain in-flight requests, then
  // close the DB pool so a deploy/restart doesn't drop requests or leak conns.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] Received ${signal} — closing server gracefully…`);

    // Force-exit if a hung connection prevents a clean close in time.
    const forceTimer = setTimeout(() => {
      console.error('[shutdown] Forced exit after 10s timeout.');
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    server.close(async () => {
      try {
        await db.close();
        console.log('[shutdown] Closed HTTP server and DB pool. Bye.');
        clearTimeout(forceTimer);
        process.exit(0);
      } catch (err) {
        console.error('[shutdown] Error during shutdown:', err);
        process.exit(1);
      }
    });
  }

  ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  // Last-resort safety nets: log and exit so the orchestrator can restart a
  // process left in an unknown state rather than letting it run corrupted.
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled promise rejection:', reason);
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err);
    shutdown('uncaughtException');
  });
}

module.exports = app;
