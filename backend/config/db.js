const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'lying_in_clinic';

// Warn operators if the app is connecting as the DB superuser in production.
// Use a dedicated least-privilege DB account instead (SELECT, INSERT, UPDATE, DELETE only).
if (process.env.NODE_ENV === 'production' && DB_USER === 'root') {
  console.warn(
    '[SECURITY WARNING] The database is configured to connect as "root". ' +
    'Create a dedicated MySQL user with only the required privileges (SELECT, INSERT, UPDATE, DELETE) ' +
    'and set DB_USER/DB_PASSWORD in your .env accordingly.'
  );
}

/**
 * Ensure the database exists, then return a connection pool bound to it.
 * Auto-creates the database if missing so the README's "just run npm start"
 * experience actually works.
 */
async function ensureDatabase() {
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✓ Database "${DB_NAME}" ready`);
  } finally {
    await bootstrap.end();
  }
}

function buildPool() {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });
}

const MAX_RETRIES = Number(process.env.DB_CONNECT_RETRIES) || 10;
const RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_DELAY_MS) || 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect with retry/backoff so the API survives MySQL not being ready yet
 * (common in Docker where the DB container starts in parallel).
 */
async function connectWithRetry() {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ensureDatabase();
      const pool = buildPool();
      const conn = await pool.getConnection();
      console.log('✓ Connected to MySQL database');
      conn.release();
      return pool;
    } catch (err) {
      lastErr = err;
      console.error(
        `Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  console.error('Database connection failed after all retries.');
  console.error('  Check your DB_HOST / DB_USER / DB_PASSWORD in backend/.env');
  throw lastErr;
}

let poolPromise;
if (process.env.NODE_ENV === 'test') {
  // Don't open real DB connections during unit tests; models are mocked.
  poolPromise = Promise.reject(new Error('Database is disabled in the test environment'));
  poolPromise.catch(() => {}); // swallow to avoid unhandled rejection warnings
} else {
  poolPromise = connectWithRetry();
}

/**
 * `db` exposes a promise-based query/execute API identical to the
 * `mysql2/promise` pool. Awaiting it gives the live pool; calls like
 * `db.execute(...)` are queued until the pool is ready.
 */
const db = {
  execute: (...args) => poolPromise.then((p) => p.execute(...args)),
  query: (...args) => poolPromise.then((p) => p.query(...args)),
  getConnection: () => poolPromise.then((p) => p.getConnection()),
  /** Resolves once the pool is ready. Call before running migrations/seeds. */
  ready: () => poolPromise,
  /**
   * Lightweight readiness check used by the /health/ready probe.
   * Runs `SELECT 1` against the pool; resolves true if the DB answers.
   */
  async ping() {
    const pool = await poolPromise;
    await pool.query('SELECT 1');
    return true;
  },
  /**
   * Gracefully close the pool. Called on SIGTERM/SIGINT so in-flight queries
   * can finish and connections are released cleanly during a deploy/restart.
   */
  async close() {
    try {
      const pool = await poolPromise;
      await pool.end();
    } catch {
      // Pool was never established (e.g. test env) — nothing to close.
    }
  }
};

module.exports = db;
