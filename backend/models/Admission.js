const db = require('../config/db');
const { encryptObject, decryptObject } = require('../utils/encryption');

// Free-text clinical fields are encrypted like patient/consultation notes.
const ADMISSION_ENC = ['chief_complaint', 'admitting_diagnosis', 'labor_notes', 'notes'];
const DELIVERY_ENC = ['attendant', 'complications'];
const NEWBORN_ENC = ['notes'];
const DISCHARGE_ENC = ['final_diagnosis', 'instructions', 'override_reason'];
const REFERRAL_ENC = ['reason', 'notes'];
const FOLLOWUP_ENC = ['notes'];

const enc = (obj, fields) => encryptObject(obj, fields);
const dec = (obj, fields) => decryptObject(obj, fields);

const ADMISSION_UPDATABLE = [
  'pregnancy_id', 'admitted_at', 'chief_complaint', 'admitting_diagnosis', 'bp', 'pulse', 'resp_rate',
  'temperature', 'labor_notes', 'risk_flags', 'consent_signed', 'consent_by', 'philhealth_package', 'notes', 'bed_number'
];

const clean = (v) => (v === '' || v === undefined ? null : v);

const SELECT_ADMISSION = `
  SELECT a.*, p.first_name, p.last_name, p.age, p.date_of_birth,
         u.name AS admitted_by_name
  FROM admissions a
  JOIN patients p ON p.id = a.patient_id
  LEFT JOIN users u ON u.id = a.admitted_by
`;

class Admission {
  static async create(data, userId) {
    const d = enc(data, ADMISSION_ENC);
    const [result] = await db.execute(
      `INSERT INTO admissions (
         patient_id, pregnancy_id, admitted_at, admitted_by, chief_complaint, admitting_diagnosis,
         bp, pulse, resp_rate, temperature, labor_notes, risk_flags, consent_signed, consent_by,
         philhealth_package, notes, bed_number, bed_price
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
      [
        d.patient_id, clean(d.pregnancy_id), d.admitted_at ?? new Date(), userId ?? null,
        clean(d.chief_complaint), clean(d.admitting_diagnosis), clean(d.bp), clean(d.pulse),
        clean(d.resp_rate), clean(d.temperature), clean(d.labor_notes),
        JSON.stringify(d.risk_flags ?? []), d.consent_signed ?? false, clean(d.consent_by),
        clean(d.philhealth_package), clean(d.notes), clean(d.bed_number), clean(d.bed_price)
      ]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.execute(`${SELECT_ADMISSION} WHERE a.id = ?`, [id]);
    return rows[0] ? dec(rows[0], ADMISSION_ENC) : null;
  }

  static async list({ status, month, patientId, limit = 200 } = {}) {
    const conditions = [];
    const values = [];
    if (status) { conditions.push('a.status = ?'); values.push(status); }
    if (patientId) { conditions.push('a.patient_id = ?'); values.push(patientId); }
    if (month) {
      conditions.push("to_char(a.admitted_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = ?");
      values.push(month);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const [rows] = await db.execute(
      `${SELECT_ADMISSION}${where} ORDER BY a.admitted_at DESC LIMIT ${safeLimit}`,
      values
    );
    return rows.map((r) => dec(r, ADMISSION_ENC));
  }

  static async listActive() {
    const [rows] = await db.execute(
      `${SELECT_ADMISSION} WHERE a.status IN ('admitted', 'in_labor', 'delivered') ORDER BY a.admitted_at ASC`,
      []
    );
    return rows.map((r) => dec(r, ADMISSION_ENC));
  }

  static async findActiveByPatient(patientId) {
    const [rows] = await db.execute(
      `${SELECT_ADMISSION} WHERE a.patient_id = ? AND a.status IN ('admitted', 'in_labor', 'delivered') LIMIT 1`,
      [patientId]
    );
    return rows[0] ? dec(rows[0], ADMISSION_ENC) : null;
  }

  // The open stay that currently has this bed (optionally ignoring one stay).
  static async findActiveByBed(bedNumber, excludeId = null) {
    const [rows] = await db.execute(
      `SELECT a.id, a.patient_id, p.first_name, p.last_name FROM admissions a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.bed_number = ? AND a.status IN ('admitted', 'in_labor', 'delivered') AND a.id <> ?
       LIMIT 1`,
      [bedNumber, excludeId ?? 0]
    );
    return rows[0] || null;
  }

  static async highestActiveBed() {
    const [rows] = await db.execute(
      "SELECT COALESCE(MAX(bed_number), 0) AS highest FROM admissions WHERE status IN ('admitted', 'in_labor', 'delivered')",
      []
    );
    return Number(rows[0]?.highest || 0);
  }

  static async update(id, data) {
    const d = enc(data, ADMISSION_ENC);
    const sets = [];
    const values = [];
    for (const col of ADMISSION_UPDATABLE) {
      if (d[col] === undefined) continue;
      if (col === 'risk_flags') {
        sets.push('risk_flags = ?::jsonb');
        values.push(JSON.stringify(d[col] ?? []));
      } else {
        sets.push(`${col} = ?`);
        values.push(col === 'consent_signed' ? Boolean(d[col]) : clean(d[col]));
      }
    }
    if (!sets.length) return false;
    values.push(id);
    const [result] = await db.execute(`UPDATE admissions SET ${sets.join(', ')} WHERE id = ?`, values);
    return result.affectedRows > 0;
  }

  static async setStatus(id, status) {
    const [result] = await db.execute('UPDATE admissions SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows > 0;
  }

  // ── Delivery + newborns ───────────────────────────────────────────────
  static async getDelivery(admissionId) {
    const [rows] = await db.execute('SELECT * FROM deliveries WHERE admission_id = ?', [admissionId]);
    if (!rows[0]) return null;
    const delivery = dec(rows[0], DELIVERY_ENC);
    const [babies] = await db.execute('SELECT * FROM newborns WHERE delivery_id = ? ORDER BY id', [delivery.id]);
    delivery.newborns = babies.map((b) => dec(b, NEWBORN_ENC));
    return delivery;
  }

  static async saveDelivery(admissionId, data) {
    const d = enc(data, DELIVERY_ENC);
    return db.transaction(async (tx) => {
      const [result] = await tx.execute(
        `INSERT INTO deliveries (admission_id, delivered_at, delivery_type, attendant, complications)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (admission_id) DO UPDATE SET
           delivered_at = EXCLUDED.delivered_at, delivery_type = EXCLUDED.delivery_type,
           attendant = EXCLUDED.attendant, complications = EXCLUDED.complications
         RETURNING id`,
        [admissionId, d.delivered_at ?? new Date(), clean(d.delivery_type), clean(d.attendant), clean(d.complications)]
      );
      const deliveryId = result.insertId;
      await tx.execute('DELETE FROM newborns WHERE delivery_id = ?', [deliveryId]);
      for (const baby of data.newborns || []) {
        const b = enc(baby, NEWBORN_ENC);
        await tx.execute(
          `INSERT INTO newborns (delivery_id, sex, weight_grams, apgar_1, apgar_5, essential_care, notes)
           VALUES (?, ?, ?, ?, ?, ?::jsonb, ?)`,
          [deliveryId, clean(b.sex), clean(b.weight_grams), clean(b.apgar_1), clean(b.apgar_5),
           JSON.stringify(b.essential_care ?? []), clean(b.notes)]
        );
      }
      await tx.execute(
        "UPDATE admissions SET status = 'delivered' WHERE id = ? AND status IN ('admitted', 'in_labor')",
        [admissionId]
      );
      return deliveryId;
    });
  }

  // ── Items used ────────────────────────────────────────────────────────
  static async listItems(admissionId) {
    const [rows] = await db.execute(
      `SELECT i.*, u.name AS given_by_name FROM admission_items i
       LEFT JOIN users u ON u.id = i.given_by
       WHERE i.admission_id = ? ORDER BY i.given_at, i.id`,
      [admissionId]
    );
    return rows;
  }

  static async addItem(admissionId, { option_id, label, unit_price, quantity, given_at }, userId) {
    const [result] = await db.execute(
      `INSERT INTO admission_items (admission_id, option_id, label, unit_price, quantity, given_at, given_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, option_id ?? null, label, unit_price ?? 0, quantity ?? 1, given_at ?? new Date(), userId ?? null]
    );
    return result.insertId;
  }

  static async removeItem(admissionId, itemId) {
    const [result] = await db.execute('DELETE FROM admission_items WHERE id = ? AND admission_id = ?', [itemId, admissionId]);
    return result.affectedRows > 0;
  }

  // ── Discharge + follow-ups ───────────────────────────────────────────
  static async getDischarge(admissionId) {
    const [rows] = await db.execute(
      `SELECT d.*, u.name AS discharged_by_name FROM discharges d
       LEFT JOIN users u ON u.id = d.discharged_by WHERE d.admission_id = ?`,
      [admissionId]
    );
    return rows[0] ? dec(rows[0], DISCHARGE_ENC) : null;
  }

  static async discharge(admissionId, data, userId, followupDates = []) {
    const d = enc(data, DISCHARGE_ENC);
    return db.transaction(async (tx) => {
      const [result] = await tx.execute(
        `INSERT INTO discharges (admission_id, discharged_at, disposition, final_diagnosis, instructions, override_reason, discharged_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [admissionId, d.discharged_at ?? new Date(), d.disposition, clean(d.final_diagnosis),
         clean(d.instructions), clean(d.override_reason), userId ?? null]
      );
      await tx.execute("UPDATE admissions SET status = 'discharged' WHERE id = ?", [admissionId]);
      for (const due of followupDates) {
        await tx.execute('INSERT INTO postpartum_followups (admission_id, due_at) VALUES (?, ?)', [admissionId, due]);
      }
      return result.insertId;
    });
  }

  static async listFollowupsForAdmission(admissionId) {
    const [rows] = await db.execute(
      'SELECT * FROM postpartum_followups WHERE admission_id = ? ORDER BY due_at', [admissionId]
    );
    return rows.map((r) => dec(r, FOLLOWUP_ENC));
  }

  static async listFollowups({ state = 'pending', limit = 200 } = {}) {
    const where = state === 'done' ? 'f.done_at IS NOT NULL' : state === 'all' ? 'TRUE' : 'f.done_at IS NULL';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
    const [rows] = await db.execute(
      `SELECT f.*, a.patient_id, p.first_name, p.last_name, p.contact_number
       FROM postpartum_followups f
       JOIN admissions a ON a.id = f.admission_id
       JOIN patients p ON p.id = a.patient_id
       WHERE ${where} ORDER BY f.due_at ASC LIMIT ${safeLimit}`,
      []
    );
    return rows.map((r) => dec(r, [...FOLLOWUP_ENC, 'contact_number']));
  }

  static async markFollowupDone(id, userId, notes) {
    const d = enc({ notes }, FOLLOWUP_ENC);
    const [result] = await db.execute(
      'UPDATE postpartum_followups SET done_at = NOW(), done_by = ?, notes = ? WHERE id = ? AND done_at IS NULL',
      [userId ?? null, clean(d.notes), id]
    );
    return result.affectedRows > 0;
  }

  // ── Referral ───────────────────────────────────────────────────────────
  static async getReferral(admissionId) {
    const [rows] = await db.execute('SELECT * FROM referrals WHERE admission_id = ?', [admissionId]);
    return rows[0] ? dec(rows[0], REFERRAL_ENC) : null;
  }

  static async refer(admissionId, data, userId) {
    const d = enc(data, REFERRAL_ENC);
    return db.transaction(async (tx) => {
      const [result] = await tx.execute(
        `INSERT INTO referrals (admission_id, facility, reason, referred_at, transport, notes, referred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [admissionId, d.facility, clean(d.reason), d.referred_at ?? new Date(), clean(d.transport), clean(d.notes), userId ?? null]
      );
      await tx.execute("UPDATE admissions SET status = 'referred' WHERE id = ?", [admissionId]);
      return result.insertId;
    });
  }

  // ── Logbook ─────────────────────────────────────────────────────────────
  static async logbook({ month } = {}) {
    const values = [];
    let where = '';
    if (month) {
      where = "WHERE to_char(a.admitted_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM') = ?";
      values.push(month);
    }
    const [rows] = await db.execute(
      `SELECT a.id, a.status, a.admitted_at, a.bed_number, p.first_name, p.last_name, p.age,
              d.delivered_at, d.delivery_type,
              (SELECT COUNT(*) FROM newborns n WHERE n.delivery_id = d.id) AS babies,
              dc.discharged_at, dc.disposition,
              r.facility AS referred_to
       FROM admissions a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN deliveries d ON d.admission_id = a.id
       LEFT JOIN discharges dc ON dc.admission_id = a.id
       LEFT JOIN referrals r ON r.admission_id = a.id
       ${where}
       ORDER BY a.admitted_at DESC`,
      values
    );
    return rows;
  }
}

module.exports = Admission;
