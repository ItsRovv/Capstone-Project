const { Pool, types } = require('pg');
require('dotenv').config();

// ── Supabase / Postgres connection ──────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432;
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'postgres';

const USE_SSL =
  process.env.DB_SSL === 'true' ||
  (!!DATABASE_URL && process.env.DB_SSL !== 'false');

// Pool tuning — environment-driven so admins can scale without touching code
const POOL_MAX = Number(process.env.DB_POOL_MAX) || 20;
const POOL_MIN = Number(process.env.DB_POOL_MIN) || 2;
const POOL_IDLE_TIMEOUT_MS = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 10000;
const POOL_CONNECTION_TIMEOUT_MS = Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS) || 5000;
const QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS) || 30000;

// Return DATE / TIMESTAMP / TIMESTAMPTZ columns as raw strings
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => v); // timestamptz
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

function buildPool() {
  const baseOpts = {
    ssl: USE_SSL ? { rejectUnauthorized: false } : false,
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    allowExitOnIdle: true,
    application_name: 'lying-in-clinic-api'
  };

  const pool = DATABASE_URL
    ? new Pool({ ...baseOpts, connectionString: DATABASE_URL })
    : new Pool({
        ...baseOpts,
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
      });

  // ── Pool event monitoring ────────────────────────────────────────────────
  pool.on('error', (err, client) => {
    console.error('[db pool] Unexpected client error:', err.message);
  });
  pool.on('connect', (client) => {
    // Enforce statement_timeout per-client so runaway queries die server-side
    client.query(`SET statement_timeout = ${Math.floor(QUERY_TIMEOUT_MS)}`).catch(() => {});
  });
  pool.on('acquire', (client) => {
    if (pool.totalCount >= pool.options.max) {
      console.warn('[db pool] Pool at capacity — consider raising DB_POOL_MAX');
    }
  });
  pool.on('remove', (client) => {
    // Normal lifecycle log; useful for tracing idle-timeout cleanups
  });

  return pool;
}

function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Run a query with an optional timeout. Returns a mysql2-compatible tuple.
 */
async function runQuery(pool, sql, params = [], { timeoutMs = QUERY_TIMEOUT_MS } = {}) {
  let text = toPgPlaceholders(sql);
  const verb = text.trim().split(/\s+/, 1)[0].toUpperCase();

  if (verb === 'INSERT' && !/returning/i.test(text)) {
    text += ' RETURNING id';
  }

  // Build the query promise
  const queryPromise = params && params.length
    ? pool.query(text, params)
    : pool.query(text);

  // Race against timeout if one is configured
  const result = timeoutMs > 0
    ? await Promise.race([
        queryPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ])
    : await queryPromise;

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

function looksLikePlaceholder(url) {
  return /[<>]/.test(url);
}

async function connectWithRetry() {
  if (DATABASE_URL && looksLikePlaceholder(DATABASE_URL)) {
    console.error(
      '[db] DATABASE_URL still contains placeholder characters (< >).\n' +
      '     Please replace it with your real Supabase connection string in backend/.env'
    );
  }

  if (DATABASE_URL) {
    try {
      const u = new URL(DATABASE_URL);
      console.log(`[db] Connecting via connection string → ${u.hostname}:${u.port}/${u.pathname.slice(1)}`);
    } catch { /* ignore */ }
  } else {
    console.log(`[db] Connecting via discrete vars → ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  }

  console.log(`[db] Pool config → max=${POOL_MAX}, min=${POOL_MIN}, idle=${POOL_IDLE_TIMEOUT_MS}ms, connTimeout=${POOL_CONNECTION_TIMEOUT_MS}ms, queryTimeout=${QUERY_TIMEOUT_MS}ms`);

  let lastErr;
  let previousPool;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (previousPool) {
        try { await previousPool.end(); } catch { /* ignore */ }
        previousPool = null;
      }
      const pool = buildPool();
      previousPool = pool;
      await pool.query('SELECT 1 AS one');
      console.log('✓ Connected to Supabase/Postgres database');
      return pool;
    } catch (err) {
      lastErr = err;
      if (previousPool) {
        try { await previousPool.end(); } catch { /* ignore */ }
        previousPool = null;
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
  poolPromise = Promise.reject(new Error('Database is disabled in the test environment'));
  poolPromise.catch(() => {});
} else {
  poolPromise = connectWithRetry();
}

const db = {
  execute: (sql, params) => poolPromise.then((p) => runQuery(p, sql, params)),
  query: (sql, params) => poolPromise.then((p) => runQuery(p, sql, params)),

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

  ready: () => poolPromise,

  async ping() {
    const pool = await poolPromise;
    await pool.query('SELECT 1');
    return true;
  },

  /**
   * Expose raw pool diagnostics so health probes and metrics can inspect saturation.
   */
  async poolStats() {
    const pool = await poolPromise;
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      max: pool.options.max
    };
  },

  async close() {
    try {
      const pool = await poolPromise;
      console.log('[db] Draining pool and closing connections…');
      await pool.end();
      console.log('[db] Pool closed cleanly.');
    } catch {
      // Pool was never established — nothing to close.
    }
  }
};

module.exports = db;
