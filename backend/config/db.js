/**
 * db.js — delegates to dbManager for auto-failover support.
 *
 * In test mode, the database is disabled (mocks are used).
 * In production/development, dbManager handles primary (Supabase) and
 * fallback (local PostgreSQL) pools with automatic health-check failover.
 */
const dbManager = require('./dbManager');

let db;

if (process.env.NODE_ENV === 'test') {
  // Tests use mocks — reject any real DB connection.
  const err = Promise.reject(new Error('Database is disabled in the test environment'));
  err.catch(() => {});

  db = {
    execute: () => err,
    query: () => err,
    transaction: () => Promise.reject(new Error('Database is disabled in the test environment')),
    ready: () => err,
    ping: () => Promise.reject(new Error('Database is disabled in the test environment')),
    poolStats: () => Promise.resolve({ totalCount: 0, idleCount: 0, waitingCount: 0, max: 0 }),
    close: () => Promise.resolve(),
  };
} else {
  // Initialize dbManager on first require
  dbManager.init().catch((err) => {
    console.error('[db] Failed to initialize dbManager:', err.message);
    process.exit(1);
  });

  db = {
    execute: (sql, params) => dbManager.execute(sql, params),
    query: (sql, params) => dbManager.query(sql, params),

    async transaction(fn) {
      return dbManager.transaction(fn);
    },

    ready: () => dbManager.ready(),

    async ping() {
      return dbManager.ping();
    },

    async poolStats() {
      return dbManager.poolStats();
    },

    getMode: () => dbManager.getMode(),
    isFailover: () => dbManager.isFailover(),

    async close() {
      return dbManager.close();
    },
  };
}

module.exports = db;
