const { snapshotToLocal, reverseSync, TABLES, FALLBACK_ID_FLOOR } = require('../utils/sync');

// A tiny in-memory stand-in for a pg pool: knows its columns and rows per table.
function fakePool(schema, data = {}) {
  const inserts = [];
  const sequences = [];
  return {
    inserts,
    sequences,
    async query(sql, params = []) {
      if (sql.includes('information_schema.columns')) {
        const cols = schema[params[0]] || {};
        return { rows: Object.entries(cols).map(([column_name, data_type]) => ({ column_name, data_type })) };
      }
      if (/^\s*SELECT .* FROM (\w+) ORDER BY id/s.test(sql)) {
        return { rows: data[sql.match(/FROM (\w+) ORDER BY id/)[1]] || [] };
      }
      if (sql.includes('OVERRIDING SYSTEM VALUE')) {
        inserts.push({ table: sql.match(/INSERT INTO (\w+)/)[1], sql, params });
        return { rowCount: 1 };
      }
      if (sql.includes('MAX(id)')) return { rows: [{ max_id: 7 }] };
      if (sql.includes('setval')) { sequences.push(params[0]); return { rows: [] }; }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

const admissionsCols = { id: 'bigint', patient_id: 'bigint', risk_flags: 'jsonb', risk_ack_reason: 'text', only_on_source: 'text' };

describe('failover sync', () => {
  test('covers every admission table, parents before children', () => {
    for (const t of ['admissions', 'deliveries', 'newborns', 'admission_items', 'midwife_notes', 'labor_entries',
      'admission_vitals', 'discharge_checklists', 'discharges', 'referrals', 'postpartum_followups',
      'clinic_options', 'clinic_settings', 'queue_entries', 'consultation_transactions']) {
      expect(TABLES).toContain(t);
    }
    expect(TABLES.indexOf('patients')).toBeLessThan(TABLES.indexOf('admissions'));
    expect(TABLES.indexOf('admissions')).toBeLessThan(TABLES.indexOf('deliveries'));
    expect(TABLES.indexOf('deliveries')).toBeLessThan(TABLES.indexOf('newborns'));
    expect(TABLES.indexOf('admissions')).toBeLessThan(TABLES.indexOf('consultation_transactions'));
  });

  test('copies the columns both databases have, writes jsonb arrays as JSON, keeps ids', async () => {
    const source = fakePool({ admissions: admissionsCols }, { admissions: [{ id: 5, patient_id: 2, risk_flags: ['breech'], risk_ack_reason: 'ok', only_on_source: 'x' }] });
    const target = fakePool({ admissions: { id: 'bigint', patient_id: 'bigint', risk_flags: 'jsonb', risk_ack_reason: 'text' } });
    await reverseSync(source, target);
    const insert = target.inserts.find((i) => i.table === 'admissions');
    expect(insert.sql).toContain('(id, patient_id, risk_flags, risk_ack_reason)');
    expect(insert.sql).not.toContain('only_on_source');
    expect(insert.params).toEqual([5, 2, '["breech"]', 'ok']);
  });

  test('a table missing on one side is skipped, not fatal', async () => {
    const source = fakePool({ admissions: admissionsCols }, { admissions: [{ id: 1, patient_id: 1 }] });
    const target = fakePool({});
    await expect(snapshotToLocal(source, target)).resolves.toBe(0);
    expect(target.inserts).toHaveLength(0);
  });

  test('snapshot keeps new local ids above the floor; reverse sync continues from the highest id', async () => {
    const schema = { admissions: admissionsCols };
    const data = { admissions: [{ id: 1, patient_id: 1 }] };
    const local = fakePool(schema);
    await snapshotToLocal(fakePool(schema, data), local);
    expect(local.sequences).toContain(FALLBACK_ID_FLOOR);
    const primary = fakePool(schema);
    await reverseSync(fakePool(schema, data), primary);
    expect(primary.sequences).toContain(7);
  });
});
