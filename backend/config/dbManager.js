const { Pool, types } = require('pg');
require('dotenv').config();

// ── Type parsers (same as db.js) ────────────────────────────────────────────
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1184, (v) => v);
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

// ── Config ──────────────────────────────────────────────────────────────────
const PRIMARY_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const FB_HOST = process.env.FALLBACK_DB_HOST || 'localhost';
const FB_PORT = process.env.FALLBACK_DB_PORT ? Number(process.env.FALLBACK_DB_PORT) : 5432;
const FB_USER = process.env.FALLBACK_DB_USER || 'postgres';
const FB_PASSWORD = process.env.FALLBACK_DB_PASSWORD || '';
const FB_NAME = process.env.FALLBACK_DB_NAME || 'jlmc_local';
const FB_SSL = process.env.FALLBACK_DB_SSL === 'true';

const POOL_MAX = Number(process.env.DB_POOL_MAX) || 20;
const POOL_MIN = Number(process.env.DB_POOL_MIN) || 2;
const POOL_IDLE = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 10000;
const POOL_CONN_TIMEOUT = Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS) || 5000;
const QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS) || 30000;

const HEALTH_INTERVAL_MS = Number(process.env.DB_HEALTH_CHECK_INTERVAL_MS) || 30000;
const HEALTH_FAIL_THRESHOLD = Number(process.env.DB_HEALTH_FAIL_THRESHOLD) || 3;

const MAX_RETRIES = Number(process.env.DB_CONNECT_RETRIES) || 10;
const RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_DELAY_MS) || 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── State ───────────────────────────────────────────────────────────────────
let primaryPool = null;
let fallbackPool = null;
let activePool = null;
let isFailover = false;
let consecutiveFailures = 0;
let healthTimer = null;
let recoveryInProgress = false;

// ── Pool builder ────────────────────────────────────────────────────────────
function buildPrimaryPool() {
  const baseOpts = {
    ssl: PRIMARY_URL ? { rejectUnauthorized: false } : false,
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: POOL_IDLE,
    connectionTimeoutMillis: POOL_CONN_TIMEOUT,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    allowExitOnIdle: true,
    application_name: 'lying-in-clinic-api',
  };

  const pool = PRIMARY_URL
    ? new Pool({ ...baseOpts, connectionString: PRIMARY_URL })
    : new Pool({
        ...baseOpts,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'postgres',
      });

  pool.on('error', (err) => {
    console.error('[dbManager] Primary pool error:', err.message);
  });
  pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${Math.floor(QUERY_TIMEOUT_MS)}`).catch(() => {});
  });

  return pool;
}

function buildFallbackPool() {
  const pool = new Pool({
    host: FB_HOST,
    port: FB_PORT,
    user: FB_USER,
    password: FB_PASSWORD,
    database: FB_NAME,
    ssl: FB_SSL ? { rejectUnauthorized: false } : false,
    max: Math.min(POOL_MAX, 10),
    min: 1,
    idleTimeoutMillis: POOL_IDLE,
    connectionTimeoutMillis: POOL_CONN_TIMEOUT,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    allowExitOnIdle: true,
    application_name: 'lying-in-clinic-api-fallback',
  });

  pool.on('error', (err) => {
    console.error('[dbManager] Fallback pool error:', err.message);
  });
  pool.on('connect', (client) => {
    client.query(`SET statement_timeout = ${Math.floor(QUERY_TIMEOUT_MS)}`).catch(() => {});
  });

  return pool;
}

// ── Placeholder helpers ─────────────────────────────────────────────────────
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function runQuery(poolOrClient, sql, params = [], { timeoutMs = QUERY_TIMEOUT_MS } = {}) {
  let text = toPgPlaceholders(sql);
  const verb = text.trim().split(/\s+/, 1)[0].toUpperCase();

  if (verb === 'INSERT' && !/returning/i.test(text)) {
    text += ' RETURNING id';
  }

  const queryPromise = params && params.length
    ? poolOrClient.query(text, params)
    : poolOrClient.query(text);

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

// ── Connection ──────────────────────────────────────────────────────────────
async function connectPrimary() {
  if (PRIMARY_URL) {
    try {
      const u = new URL(PRIMARY_URL);
      console.log(`[dbManager] Primary: ${u.hostname}:${u.port}${u.pathname}`);
    } catch { /* ignore */ }
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (primaryPool) {
        try { await primaryPool.end(); } catch { /* ignore */ }
      }
      primaryPool = buildPrimaryPool();
      await primaryPool.query('SELECT 1 AS one');
      console.log('✓ [dbManager] Connected to primary (Supabase)');
      return primaryPool;
    } catch (err) {
      lastErr = err;
      if (primaryPool) {
        try { await primaryPool.end(); } catch { /* ignore */ }
        primaryPool = null;
      }
      console.error(`[dbManager] Primary attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

async function connectFallback() {
  if (!FB_PASSWORD && process.env.NODE_ENV !== 'test') {
    console.warn('[dbManager] No FALLBACK_DB_PASSWORD set — fallback disabled');
    return null;
  }

  try {
    if (fallbackPool) {
      try { await fallbackPool.end(); } catch { /* ignore */ }
    }
    fallbackPool = buildFallbackPool();
    await fallbackPool.query('SELECT 1 AS one');
    console.log('✓ [dbManager] Fallback (local PG) connected');
    return fallbackPool;
  } catch (err) {
    console.warn(`[dbManager] Fallback connection failed: ${err.message}`);
    fallbackPool = null;
    return null;
  }
}

// ── Failover / Recovery ─────────────────────────────────────────────────────
async function failoverToFallback() {
  if (isFailover) return;
  if (!fallbackPool) {
    console.error('[dbManager] Cannot failover — no fallback pool available');
    return;
  }

  console.warn('[dbManager] ⚠ Switching to fallback (local PostgreSQL)');
  isFailover = true;
  activePool = fallbackPool;
  consecutiveFailures = 0;
}

async function recoverToPrimary() {
  if (!isFailover || recoveryInProgress) return;
  recoveryInProgress = true;

  console.log('[dbManager] Supabase recovered — starting reverse sync...');

  try {
    const sync = require('../utils/sync');
    await sync.reverseSync(fallbackPool, primaryPool);
    console.log('✓ [dbManager] Reverse sync complete — switching back to primary');
    isFailover = false;
    activePool = primaryPool;
  } catch (err) {
    console.error(`[dbManager] Reverse sync failed: ${err.message} — staying on fallback`);
  } finally {
    recoveryInProgress = false;
  }
}

async function checkPrimaryHealth() {
  if (!primaryPool || isFailover) {
    if (isFailover && primaryPool) {
      try {
        await primaryPool.query('SELECT 1');
        await recoverToPrimary();
      } catch {
        // Still down
      }
    }
    return;
  }

  try {
    await primaryPool.query('SELECT 1');
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    console.warn(`[dbManager] Primary health check failed (${consecutiveFailures}/${HEALTH_FAIL_THRESHOLD}): ${err.message}`);

    if (consecutiveFailures >= HEALTH_FAIL_THRESHOLD) {
      await failoverToFallback();
    }
  }
}

function startHealthCheck() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    checkPrimaryHealth().catch((err) => {
      console.error('[dbManager] Health check error:', err.message);
    });
  }, HEALTH_INTERVAL_MS);
  console.log(`[dbManager] Health check started (every ${HEALTH_INTERVAL_MS / 1000}s)`);
}

// ── Init ────────────────────────────────────────────────────────────────────
// Tracks the in-flight/completed init so `ready()` and repeated `init()`
// calls all await the same promise instead of racing ahead of the primary
// connection (which previously caused "Database not initialized" errors).
let initPromise = null;

async function doInit() {
  await connectPrimary();
  activePool = primaryPool;

  // Try to connect fallback in the background (non-blocking)
  connectFallback().then(async (fb) => {
    if (fb) {
      // Run schema on fallback to ensure tables exist
      try {
        const fs = require('fs');
        const path = require('path');
        const schema = fs.readFileSync(
          path.join(__dirname, '..', '..', 'database', 'schema.sql'),
          'utf8'
        );
        await fallbackPool.query(schema);
        console.log('✓ [dbManager] Fallback schema applied');

        // Snapshot primary → fallback
        if (process.env.DB_AUTO_SYNC !== 'false') {
          const sync = require('../utils/sync');
          await sync.snapshotToLocal(primaryPool, fallbackPool);
        }
      } catch (err) {
        console.warn(`[dbManager] Fallback setup error: ${err.message}`);
      }
    }
  }).catch((err) => {
    console.warn(`[dbManager] Fallback init error: ${err.message}`);
  });

  startHealthCheck();
  return activePool;
}

function init() {
  if (!initPromise) {
    initPromise = doInit();
  }
  return initPromise;
}

// Resolve the pool to use for a query, waiting for init() to finish if it's
// still in flight (fixes a race where queries ran before the primary pool
// was connected, throwing "Database not initialized").
async function resolvePool() {
  if (!activePool) {
    await init();
  }
  if (!activePool) throw new Error('Database not initialized');
  return activePool;
}

// ── Public API (same interface as old db.js) ────────────────────────────────
const dbManager = {
  execute: async (sql, params) => {
    const pool = await resolvePool();
    return runQuery(pool, sql, params);
  },

  query: async (sql, params) => {
    const pool = await resolvePool();
    return runQuery(pool, sql, params);
  },

  async transaction(fn) {
    const pool = await resolvePool();
    const client = await pool.connect();
    const tx = {
      execute: (sql, params) => runQuery(client, sql, params),
      query: (sql, params) => runQuery(client, sql, params),
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

  ready: () => resolvePool(),

  async ping() {
    const pool = await resolvePool();
    await pool.query('SELECT 1');
    return true;
  },

  async poolStats() {
    if (!activePool) return { totalCount: 0, idleCount: 0, waitingCount: 0, max: 0 };
    return {
      totalCount: activePool.totalCount,
      idleCount: activePool.idleCount,
      waitingCount: activePool.waitingCount,
      max: activePool.options.max,
    };
  },

  getMode: () => isFailover ? 'fallback' : 'primary',
  isFailover: () => isFailover,

  getPrimaryPool: () => primaryPool,
  getFallbackPool: () => fallbackPool,
  getActivePool: () => activePool,

  init,

  async close() {
    if (healthTimer) clearInterval(healthTimer);
    const promises = [];
    if (primaryPool) {
      console.log('[dbManager] Closing primary pool...');
      promises.push(primaryPool.end());
    }
    if (fallbackPool) {
      console.log('[dbManager] Closing fallback pool...');
      promises.push(fallbackPool.end());
    }
    await Promise.allSettled(promises);
    console.log('[dbManager] All pools closed.');
  },
};

module.exports = dbManager;
