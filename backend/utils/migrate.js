const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Idempotent schema bootstrap for Supabase / Postgres.
 *
 * The canonical DDL lives in `database/schema.sql`. Every statement there uses
 * `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, and
 * `DROP TRIGGER IF EXISTS … CREATE TRIGGER …`, so applying the whole file on
 * each startup is safe and self-healing.
 *
 * Runs automatically on server startup (see server.js). It can also be run
 * once manually from the Supabase SQL Editor by pasting schema.sql.
 */
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql');

async function runMigrations() {
  let ddl;
  try {
    ddl = fs.readFileSync(SCHEMA_PATH, 'utf8');
  } catch (err) {
    console.error(`[migrate] Could not read schema file at ${SCHEMA_PATH}: ${err.message}`);
    throw err;
  }

  // Postgres runs a multi-statement string (no params) via the simple query
  // protocol, correctly honouring the dollar-quoted trigger function body.
  await db.query(ddl);

  console.log('\u2713 Supabase/Postgres schema up to date');
}

module.exports = { runMigrations };
