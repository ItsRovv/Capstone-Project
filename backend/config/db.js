const { Pool, types } = require('pg');
require('dotenv').config();

// ── Supabase / Postgres connection ──────────────────────────────────────────
// Preferred: a single DATABASE_URL connection string (Supabase → Project
// Settings → Database → Connection string → "URI"). Use the connection pooler
// URI (port 6543) for serverless/long-lived apps. Falls back to discrete
// DB_* vars for local Postgres development.
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432;
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'postgres';

// Supabase (and most managed Postgres) require TLS. Enable SSL whenever a
// connection string is provided or DB_SSL is explicitly turned on.
const USE_SSL =
  process.env.DB_SSL === 'true' ||
  (!!DATABASE_URL && process.env.DB_SSL !== 'false');

// Return DATE / TIMESTAMP / TIMESTAMPTZ columns as raw strings (mimics the old
// mysql2 `dateStrings: true` behaviour) so the API and frontend keep receiving
// 'YYYY-MM-DD …' strings instead of JS Date objects.
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp (without tz)
types.setTypeParser(1184, (v) => v); // timestamptz
// Parse BIGINT (int8) and NUMERIC as JS numbers so COUNT(*)/totals stay numeric.
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

function buildPool() {
  const baseOpts = {
    ssl: USE_SSL ? { rejectUnauthorized: false } : false,
    max: 10,
    application_name: 'lying-in-clinic-api'
  };
  if (DATABASE_URL) {
    return new Pool({ ...baseOpts, connectionString: DATABASE_URL });
  }
  return new Pool({
    ...baseOpts,
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  });
}

/**
 * Translate mysql2-style positional `?` placeholders into Postgres `$1, $2 …`.
 * Lets the existing models keep using `?` while we run on Postgres.
 */
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Run a query and return a mysql2-compatible `[rowsOrResult, fields]` tuple.
 *  - SELECT          → first element is the array of rows.
 *  - INSERT          → `{ insertId, affectedRows }` (auto-appends RETURNING id).
 *  - UPDATE / DELETE → `{ affectedRows }`.
 */
async function runQuery(pool, sql, params = []) {
  let text = toPgPlaceholders(sql);
  const verb = text.trim().split(/\s+/, 1)[0].toUpperCase();

  if (verb === 'INSERT' && !/returning/i.test(text)) {
    text += ' RETURNING id';
  }

  // When params are supplied, pg uses the extended protocol (single statement).
  // With no params, fall back to the simple protocol so multi-statement DDL
  // (e.g. the whole schema.sql) can be executed in one call.
  const result = params && params.length
    ? await pool.query(text, params)
    : await pool.query(text);

  if (verb === 'INSERT') {
    return [{ insertId: result.rows[0]?.id, affectedRows: result.rowCount }, result.fields];
  }
  if (verb === 'UPDATE' || verb === 'DELETE') {
    return [{ affectedRows: result.rowCount }, result.fields];
  }
  return [result.rows, result.fields];
}

const MAX_RETRIES = Number(process.env.DB_CONNECT_RETRIES) || 10;
const RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_DELAY_MS) || 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validate the DATABASE_URL looks like a real connection string, not the
 * placeholder copied from .env.example.
 */
function looksLikePlaceholder(url) {
  return /[<>]/.test(url);
}

/**
 * Connect with retry/backoff so the API survives Postgres/Supabase not being
 * reachable yet (transient network blips, container start order, etc.).
 */
async function connectWithRetry() {
  if (DATABASE_URL && looksLikePlaceholder(DATABASE_URL)) {
    console.error(
      '[db] DATABASE_URL still contains placeholder characters (< >).\n' +
      '     Please replace it with your real Supabase connection string in backend/.env'
    );
  }

  // Log what we're connecting to (without the password).
  if (DATABASE_URL) {
    try {
      const u = new URL(DATABASE_URL);
      console.log(`[db] Connecting via connection string → ${u.hostname}:${u.port}/${u.pathname.slice(1)}`);
    } catch { /* ignore parse errors, connection will fail with a clearer message */ }
  } else {
    console.log(`[db] Connecting via discrete vars → ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let pool;
    try {
      pool = buildPool();
      // Use pool.query so pg handles client acquisition/release internally.
      // This avoids protocol-level issues with the Supabase connection pooler.
      await pool.query('SELECT 1 AS one');
      console.log('✓ Connected to Supabase/Postgres database');
      return pool;
    } catch (err) {
      lastErr = err;
      if (pool) {
        try { await pool.end(); } catch { /* ignore */ }
      }
      console.error(
        `Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  console.error('Database connection failed after all retries.');
  console.error('  Check your DATABASE_URL (or DB_HOST/DB_USER/DB_PASSWORD) in backend/.env');
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
 * `db` exposes a promise-based query API that mirrors the `mysql2/promise`
 * pool surface used across the models. Awaiting any method queues the call
 * until the Postgres pool is ready. `?` placeholders and `result.insertId /
 * affectedRows` keep working via `runQuery`.
 */
const db = {
  execute: (sql, params) => poolPromise.then((p) => runQuery(p, sql, params)),
  query: (sql, params) => poolPromise.then((p) => runQuery(p, sql, params)),
  /**
   * Run a set of statements inside a single transaction. The callback receives
   * a `tx` object with the same `execute/query` interface bound to one client.
   */
  async transaction(fn) {
    const pool = await poolPromise;
    const client = await pool.connect();
    const tx = {
      execute: (sql, params) => runQuery(client, sql, params),
      query: (sql, params) => runQuery(client, sql, params)
    };
    try {
      await client.query('BEGIN');
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
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
