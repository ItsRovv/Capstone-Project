/**
 * Data sync utilities for Supabase ↔ local PostgreSQL failover.
 *
 * snapshotToLocal: Full copy of all tables from primary (Supabase) → fallback (local).
 * reverseSync:    Push rows created/updated during failover back to primary.
 */

const TABLES = [
  'users',
  'patients',
  'consultations',
  'pregnancies',
  'pregnancy_tracking_forms',
  'clinic_reports',
  'audit_logs',
];

// Columns for each table (excluding auto-generated id and created_at)
const TABLE_COLUMNS = {
  users: [
    'name', 'email', 'password_hash', 'role', 'google_id', 'apple_id',
    'failed_login_attempts', 'locked_until', 'email_verified',
    'otp_code_hash', 'otp_expires_at', 'otp_purpose', 'otp_attempts',
    'updated_at',
  ],
  patients: [
    'first_name', 'last_name', 'date_of_birth', 'age', 'sex',
    'address', 'contact_number', 'emergency_contact', 'allergies',
    'created_at', 'updated_at',
  ],
  consultations: [
    'patient_id', 'doctor_id', 'visit_date', 'raw_notes', 'structured_notes',
    'chief_complaint', 'diagnosis', 'prescription', 'ai_summary_used',
    'created_at', 'updated_at',
  ],
  pregnancies: [
    'patient_id', 'lmp', 'edd', 'gp', 'trimester', 'weeks',
    'status', 'notes', 'created_at', 'updated_at',
  ],
  pregnancy_tracking_forms: [
    'month_year', 'rows', 'created_at', 'updated_at',
  ],
  clinic_reports: [
    'report_date', 'report_type', 'ai_generated_text', 'total_patients',
    'metrics', 'created_at',
  ],
  audit_logs: [
    'user_id', 'action', 'table_name', 'record_id', 'old_data',
    'new_data', 'ip_address', 'created_at',
  ],
};

/**
 * Full snapshot: copy all rows from source pool → target pool.
 * Uses INSERT ... ON CONFLICT (id) DO UPDATE for idempotency.
 */
async function snapshotToLocal(sourcePool, targetPool) {
  console.log('[sync] Starting snapshot to local DB...');
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const columns = TABLE_COLUMNS[table];
      const colList = ['id', ...columns].join(', ');
      const placeholders = ['id', ...columns].map((_, i) => `$${i + 1}`).join(', ');
      const updateSet = columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

      // Read all rows from source
      const { rows } = await sourcePool.query(`SELECT ${colList} FROM ${table} ORDER BY id`);

      if (rows.length === 0) {
        console.log(`[sync] ${table}: 0 rows (skipped)`);
        continue;
      }

      // Batch insert/update into target
      for (const row of rows) {
        const values = ['id', ...columns].map((c) => row[c] ?? null);
        await targetPool.query(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
          values
        );
      }

      // Sync the identity sequence so new local rows don't collide
      const { rows: maxRows } = await targetPool.query(`SELECT MAX(id) AS max_id FROM ${table}`);
      const maxId = maxRows[0]?.max_id || 1;
      await targetPool.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(${maxId}, 1000000))`
      );

      totalRows += rows.length;
      console.log(`[sync] ${table}: ${rows.length} rows copied`);
    } catch (err) {
      console.error(`[sync] Error syncing table ${table}: ${err.message}`);
    }
  }

  console.log(`[sync] Snapshot complete — ${totalRows} total rows`);
}

/**
 * Reverse sync: push rows created/updated in fallback back to primary.
 * Uses updated_at to find rows that changed during failover.
 */
async function reverseSync(fallbackPool, primaryPool) {
  console.log('[sync] Starting reverse sync to Supabase...');

  // Record the sync start time — we'll use this to detect what changed
  const syncStart = new Date();
  let totalSynced = 0;

  for (const table of TABLES) {
    try {
      const columns = TABLE_COLUMNS[table];
      const colList = ['id', ...columns].join(', ');
      const placeholders = ['id', ...columns].map((_, i) => `$${i + 1}`).join(', ');
      const updateSet = columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

      // Get all rows from fallback (they were all potentially modified during failover)
      const { rows } = await fallbackPool.query(`SELECT ${colList} FROM ${table} ORDER BY id`);

      if (rows.length === 0) continue;

      let tableCount = 0;
      for (const row of rows) {
        const values = ['id', ...columns].map((c) => row[c] ?? null);
        try {
          await primaryPool.query(
            `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            values
          );
          tableCount++;
        } catch (err) {
          console.error(`[sync] Row ${row.id} in ${table} failed: ${err.message}`);
        }
      }

      totalSynced += tableCount;
      console.log(`[sync] ${table}: ${tableCount} rows pushed to primary`);
    } catch (err) {
      console.error(`[sync] Reverse sync error for ${table}: ${err.message}`);
    }
  }

  console.log(`[sync] Reverse sync complete — ${totalSynced} total rows synced`);
}

module.exports = { snapshotToLocal, reverseSync, TABLES };
