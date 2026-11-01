/**
 * Data sync utilities for Supabase <-> local PostgreSQL failover.
 *
 * snapshotToLocal: copy every table from primary (Supabase) to the fallback (local).
 * reverseSync:     push rows created or changed on the fallback during an outage back to primary.
 *
 * Columns are read from each database at run time (the ones both sides have), so a new
 * column added in schema.sql is covered without editing this file. A NEW TABLE must be
 * added to TABLES below, after the tables it references.
 */

// Parents before children, so foreign keys are satisfied when rows are inserted.
const TABLES = [
  'users',
  'patients',
  'pregnancies',
  'clinic_options',
  'clinic_settings',
  'consultations',
  'pregnancy_tracking_forms',
  'clinic_reports',
  'queue_entries',
  'admissions',
  'consultation_transactions',
  'deliveries',
  'newborns',
  'admission_items',
  'medications_given',
  'bed_moves',
  'discharges',
  'postpartum_followups',
  'referrals',
  'midwife_notes',
  'labor_entries',
  'discharge_checklists',
  'admission_vitals',
  'audit_logs',
];

// Rows made on the fallback get ids from this number up, so they cannot collide with
// ids Supabase hands out in the meantime.
const FALLBACK_ID_FLOOR = 1000000;

async function tableColumns(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

// Columns present on both sides, id first. Returns null when a table is missing on either side.
async function sharedColumns(sourcePool, targetPool, table) {
  const [src, dst] = await Promise.all([tableColumns(sourcePool, table), tableColumns(targetPool, table)]);
  if (!src.size || !dst.size || !src.has('id') || !dst.has('id')) return null;
  const columns = [...src.keys()].filter((c) => dst.has(c));
  return { columns: ['id', ...columns.filter((c) => c !== 'id')], types: src };
}

// pg turns JS arrays into Postgres arrays, which breaks jsonb columns that hold arrays.
const toParam = (value, type) => {
  if (value === undefined || value === null) return null;
  return type === 'jsonb' || type === 'json' ? JSON.stringify(value) : value;
};

async function copyTable(sourcePool, targetPool, table, { sequenceFloor }) {
  const shared = await sharedColumns(sourcePool, targetPool, table);
  if (!shared) return { skipped: true, count: 0 };
  const { columns, types } = shared;
  const colList = columns.join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const conflict = updateSet ? `DO UPDATE SET ${updateSet}` : 'DO NOTHING';

  const { rows } = await sourcePool.query(`SELECT ${colList} FROM ${table} ORDER BY id`);
  let count = 0;
  for (const row of rows) {
    try {
      await targetPool.query(
        `INSERT INTO ${table} (${colList}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})
         ON CONFLICT (id) ${conflict}`,
        columns.map((c) => toParam(row[c], types.get(c)))
      );
      count++;
    } catch (err) {
      console.error(`[sync] Row ${row.id} in ${table} failed: ${err.message}`);
    }
  }

  // Keep the next generated id past everything copied (and past the floor on the fallback).
  const { rows: maxRows } = await targetPool.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${table}`);
  const next = Math.max(Number(maxRows[0].max_id), sequenceFloor);
  if (next > 0) {
    await targetPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), $1)`, [next]);
  }
  return { skipped: false, count };
}

async function run(label, sourcePool, targetPool, options) {
  console.log(`[sync] ${label}...`);
  let total = 0;
  for (const table of TABLES) {
    try {
      const { skipped, count } = await copyTable(sourcePool, targetPool, table, options);
      if (skipped) console.log(`[sync] ${table}: not on both databases (skipped)`);
      else console.log(`[sync] ${table}: ${count} rows`);
      total += count;
    } catch (err) {
      console.error(`[sync] Error syncing table ${table}: ${err.message}`);
    }
  }
  console.log(`[sync] ${label} complete: ${total} total rows`);
  return total;
}

/** Full snapshot: primary -> fallback. Idempotent (ON CONFLICT (id) DO UPDATE). */
async function snapshotToLocal(sourcePool, targetPool) {
  return run('Snapshot to local DB', sourcePool, targetPool, { sequenceFloor: FALLBACK_ID_FLOOR });
}

/** Reverse sync: fallback -> primary, including every admission table. */
async function reverseSync(fallbackPool, primaryPool) {
  return run('Reverse sync to Supabase', fallbackPool, primaryPool, { sequenceFloor: 0 });
}

module.exports = { snapshotToLocal, reverseSync, TABLES, FALLBACK_ID_FLOOR };
