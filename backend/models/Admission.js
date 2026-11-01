const db = require('../config/db');
const { encryptObject, decryptObject } = require('../utils/encryption');

// Free-text clinical fields are encrypted like patient/consultation notes.
const ADMISSION_ENC = ['chief_complaint', 'admitting_diagnosis', 'labor_notes', 'notes',
  'referred_by', 'hospitalization_plan', 'health_insurance_name', 'medicare_other',
  'informant_name', 'informant_address', 'informant_relationship', 'icd_code', 'risk_ack_reason'];
const DELIVERY_ENC = ['attendant', 'complications'];
const MED_ENC = ['note'];
const NEWBORN_ENC = ['notes', 'name'];
const LABOR_ENC = ['notes'];
const DISCHARGE_ENC = ['final_diagnosis', 'instructions', 'override_reason', 'death_cause'];
const REFERRAL_ENC = ['reason', 'notes', 'reverse_reason'];
const FOLLOWUP_ENC = ['notes'];
const NOTE_ENC = ['description', 'original_description', 'correction_reason'];
const ITEM_ENC = ['note', 'void_reason'];

const enc = (obj, fields) => encryptObject(obj, fields);
const dec = (obj, fields) => decryptObject(obj, fields);

const ADMISSION_UPDATABLE = [
  'pregnancy_id', 'admitted_at', 'chief_complaint', 'admitting_diagnosis', 'bp', 'pulse', 'resp_rate',
  'temperature', 'labor_notes', 'risk_flags', 'consent_signed', 'consent_by', 'philhealth_packages', 'notes', 'bed_number',
  'admission_type', 'attending_physician',
  'referred_by', 'social_service_class', 'hospitalization_plan', 'health_insurance_name',
  'medicare', 'medicare_other', 'informant_name', 'informant_address', 'informant_relationship', 'icd_code',
  'philhealth_pin', 'consent_signer_type', 'consent_relationship', 'attending_user_id'
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
         philhealth_packages, notes, bed_number, bed_price, admission_type, attending_physician,
         referred_by, social_service_class, hospitalization_plan, health_insurance_name,
         medicare, medicare_other, informant_name, informant_address, informant_relationship, icd_code,
         philhealth_pin, consent_signer_type, consent_relationship, attending_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.patient_id, clean(d.pregnancy_id), d.admitted_at ?? new Date(), userId ?? null,
        clean(d.chief_complaint), clean(d.admitting_diagnosis), clean(d.bp), clean(d.pulse),
        clean(d.resp_rate), clean(d.temperature), clean(d.labor_notes),
        JSON.stringify(d.risk_flags ?? []), d.consent_signed ?? false, clean(d.consent_by),
        JSON.stringify(d.philhealth_packages ?? []), clean(d.notes), clean(d.bed_number), clean(d.bed_price),
        clean(d.admission_type), clean(d.attending_physician),
        clean(d.referred_by), clean(d.social_service_class), clean(d.hospitalization_plan),
        clean(d.health_insurance_name), clean(d.medicare), clean(d.medicare_other),
        clean(d.informant_name), clean(d.informant_address), clean(d.informant_relationship), clean(d.icd_code),
        clean(d.philhealth_pin), clean(d.consent_signer_type), clean(d.consent_relationship), clean(d.attending_user_id)
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
      if (col === 'risk_flags' || col === 'philhealth_packages') {
        sets.push(`${col} = ?::jsonb`);
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
        `INSERT INTO deliveries (admission_id, delivered_at, delivery_type, attendant, complications, problems, attendant_ids,
                                 placenta, placenta_at, blood_loss_ml, perineum, oxytocin_given, oxytocin_at)
         VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (admission_id) DO UPDATE SET
           delivered_at = EXCLUDED.delivered_at, delivery_type = EXCLUDED.delivery_type,
           attendant = EXCLUDED.attendant, complications = EXCLUDED.complications, problems = EXCLUDED.problems,
           attendant_ids = EXCLUDED.attendant_ids, placenta = EXCLUDED.placenta, placenta_at = EXCLUDED.placenta_at,
           blood_loss_ml = EXCLUDED.blood_loss_ml, perineum = EXCLUDED.perineum,
           oxytocin_given = EXCLUDED.oxytocin_given, oxytocin_at = EXCLUDED.oxytocin_at
         RETURNING id`,
        [admissionId, d.delivered_at ?? new Date(), clean(d.delivery_type), clean(d.attendant), clean(d.complications),
         JSON.stringify(d.problems ?? []), JSON.stringify(d.attendant_ids ?? []), clean(d.placenta), clean(d.placenta_at),
         clean(d.blood_loss_ml), clean(d.perineum), d.oxytocin_given ?? null, clean(d.oxytocin_at)]
      );
      const deliveryId = result.insertId;
      await tx.execute('DELETE FROM newborns WHERE delivery_id = ?', [deliveryId]);
      for (const baby of data.newborns || []) {
        const b = enc(baby, NEWBORN_ENC);
        await tx.execute(
          `INSERT INTO newborns (delivery_id, name, sex, weight_grams, length_cm, head_circumference_cm,
                                 chest_circumference_cm, abdominal_circumference_cm, apgar_1, apgar_5, essential_care, notes,
                                 birth_status, born_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
          [deliveryId, clean(b.name), clean(b.sex), clean(b.weight_grams), clean(b.length_cm),
           clean(b.head_circumference_cm), clean(b.chest_circumference_cm), clean(b.abdominal_circumference_cm),
           clean(b.apgar_1), clean(b.apgar_5), JSON.stringify(b.essential_care ?? []), clean(b.notes),
           b.birth_status || 'live', clean(b.born_at) ?? d.delivered_at ?? null]
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
  // Every line, voided ones included (they stay visible in history).
  static async listItems(admissionId) {
    const [rows] = await db.execute(
      `SELECT i.*, u.name AS given_by_name, v.name AS voided_by_name FROM admission_items i
       LEFT JOIN users u ON u.id = i.given_by
       LEFT JOIN users v ON v.id = i.voided_by
       WHERE i.admission_id = ? ORDER BY i.given_at, i.id`,
      [admissionId]
    );
    return rows.map((r) => dec(r, ITEM_ENC));
  }

  static async findItem(admissionId, itemId) {
    const [rows] = await db.execute('SELECT * FROM admission_items WHERE id = ? AND admission_id = ?', [itemId, admissionId]);
    return rows[0] ? dec(rows[0], ITEM_ENC) : null;
  }

  static async addItem(admissionId, line, userId, runner = db) {
    const d = enc({ note: line.note }, ITEM_ENC);
    const [result] = await runner.execute(
      `INSERT INTO admission_items
         (admission_id, option_id, label, unit_price, quantity, given_at, given_by, unit, charged, price_missing, used_for, unlisted, ref_key, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, line.option_id ?? null, line.label, line.unit_price ?? 0, line.quantity ?? 1, line.given_at ?? new Date(),
        userId ?? null, line.unit ?? null, line.charged ?? true, line.price_missing ?? false, line.used_for ?? 'mother',
        line.unlisted ?? false, line.ref_key ?? null, clean(d.note)]
    );
    return result.insertId;
  }

  // Nothing is hard-deleted: a removed line is voided with a reason, who and when.
  static async voidItem(admissionId, itemId, reason, userId, runner = db) {
    const d = enc({ void_reason: reason }, ITEM_ENC);
    const [result] = await runner.execute(
      'UPDATE admission_items SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ? AND admission_id = ? AND voided_at IS NULL',
      [userId ?? null, d.void_reason, itemId, admissionId]
    );
    return result.affectedRows > 0;
  }

  // Editing a quantity voids the old line and adds a corrected one, so history is kept.
  static async replaceItem(admissionId, itemId, quantity, reason, userId) {
    return db.transaction(async (tx) => {
      const [rows] = await tx.execute('SELECT * FROM admission_items WHERE id = ? AND admission_id = ? AND voided_at IS NULL', [itemId, admissionId]);
      const old = rows[0];
      if (!old) return null;
      await Admission.voidItem(admissionId, itemId, reason, userId, tx);
      return Admission.addItem(admissionId, {
        option_id: old.option_id, label: old.label, unit_price: old.unit_price, quantity, given_at: old.given_at,
        unit: old.unit, charged: old.charged, price_missing: old.price_missing, used_for: old.used_for,
        unlisted: old.unlisted, ref_key: old.ref_key, note: old.note ? dec({ note: old.note }, ITEM_ENC).note : null
      }, userId, tx);
    });
  }

  // The live (not voided) line created from a newborn-care entry, if any.
  static async findItemByRef(admissionId, refKey) {
    const [rows] = await db.execute(
      'SELECT * FROM admission_items WHERE admission_id = ? AND ref_key = ? AND voided_at IS NULL', [admissionId, refKey]
    );
    return rows[0] || null;
  }

  static async liveRefKeys(admissionId) {
    const [rows] = await db.execute(
      'SELECT id, ref_key FROM admission_items WHERE admission_id = ? AND ref_key IS NOT NULL AND voided_at IS NULL', [admissionId]
    );
    return rows;
  }

  // Usage by item for a date range (live lines only). Amount is for reference.
  static async itemUsageReport({ from, to, category } = {}) {
    const conditions = ['i.voided_at IS NULL', "(i.given_at AT TIME ZONE 'Asia/Manila')::date BETWEEN ?::date AND ?::date"];
    const values = [from, to];
    if (category) { conditions.push('COALESCE(o.category, \'other\') = ?'); values.push(category); }
    const [rows] = await db.execute(
      `SELECT COALESCE(o.category, 'other') AS category, i.label, COALESCE(i.unit, o.unit) AS unit,
              SUM(i.quantity) AS total_quantity, COUNT(DISTINCT i.admission_id) AS admissions,
              SUM(CASE WHEN i.charged THEN i.unit_price * i.quantity ELSE 0 END) AS amount, BOOL_OR(i.charged) AS charged
       FROM admission_items i LEFT JOIN clinic_options o ON o.id = i.option_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY COALESCE(o.category, 'other'), i.label, COALESCE(i.unit, o.unit)
       ORDER BY total_quantity DESC, i.label`,
      values
    );
    return rows;
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
        `INSERT INTO discharges (admission_id, discharged_at, disposition, final_diagnosis, instructions, override_reason, discharged_by, results,
                                 mother_condition, newborn_condition, follow_up_date, death_of, death_cause, death_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
        [admissionId, d.discharged_at ?? new Date(), d.disposition, clean(d.final_diagnosis),
         clean(d.instructions), clean(d.override_reason), userId ?? null, JSON.stringify(data.results ?? []),
         clean(d.mother_condition), clean(d.newborn_condition), clean(d.follow_up_date), clean(d.death_of),
         clean(d.death_cause), clean(d.death_at)]
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

  // A re-referral after a reversal reuses the same row (one referral row per stay).
  static async refer(admissionId, data, userId) {
    const d = enc(data, REFERRAL_ENC);
    return db.transaction(async (tx) => {
      const [result] = await tx.execute(
        `INSERT INTO referrals (admission_id, facility, reason, referred_at, transport, notes, referred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (admission_id) DO UPDATE SET
           facility = EXCLUDED.facility, reason = EXCLUDED.reason, referred_at = EXCLUDED.referred_at,
           transport = EXCLUDED.transport, notes = EXCLUDED.notes, referred_by = EXCLUDED.referred_by,
           reversed_at = NULL, reversed_by = NULL, reverse_reason = NULL`,
        [admissionId, d.facility, clean(d.reason), d.referred_at ?? new Date(), clean(d.transport), clean(d.notes), userId ?? null]
      );
      await tx.execute("UPDATE admissions SET status = 'referred' WHERE id = ?", [admissionId]);
      return result.insertId;
    });
  }

  // A doctor can undo a referral (cancelled, or the patient came back). The stay reopens.
  static async reverseReferral(admissionId, reason, userId) {
    const d = enc({ reverse_reason: reason }, ['reverse_reason']);
    return db.transaction(async (tx) => {
      const [result] = await tx.execute(
        'UPDATE referrals SET reversed_at = NOW(), reversed_by = ?, reverse_reason = ? WHERE admission_id = ? AND reversed_at IS NULL',
        [userId ?? null, d.reverse_reason, admissionId]
      );
      if (!result.affectedRows) return false;
      await tx.execute("UPDATE admissions SET status = 'admitted' WHERE id = ? AND status = 'referred'", [admissionId]);
      return true;
    });
  }

  // "Continue at clinic" decision for a referral-level warning sign. Who and when come from the server.
  static async acknowledgeRisk(admissionId, reason, userId) {
    const d = enc({ risk_ack_reason: reason }, ADMISSION_ENC);
    const [result] = await db.execute(
      'UPDATE admissions SET risk_ack_reason = ?, risk_ack_by = ?, risk_ack_at = NOW() WHERE id = ?',
      [d.risk_ack_reason, userId ?? null, admissionId]
    );
    return result.affectedRows > 0;
  }

  // ── Midwives' Notes ──────────────────────────────────────────────────────
  static async listNotes(admissionId) {
    const [rows] = await db.execute(
      `SELECT n.*, u.name AS author_name FROM midwife_notes n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.admission_id = ? ORDER BY n.noted_at, n.id`,
      [admissionId]
    );
    return rows.map((r) => dec(r, NOTE_ENC));
  }

  static async addNote(admissionId, description, userId) {
    const d = enc({ description }, NOTE_ENC);
    const [result] = await db.execute(
      'INSERT INTO midwife_notes (admission_id, description, user_id) VALUES (?, ?, ?)',
      [admissionId, d.description, userId ?? null]
    );
    return result.insertId;
  }

  static async findNote(admissionId, noteId) {
    const [rows] = await db.execute('SELECT * FROM midwife_notes WHERE id = ? AND admission_id = ?', [noteId, admissionId]);
    return rows[0] ? dec(rows[0], NOTE_ENC) : null;
  }

  // A correction keeps the first text and records the reason, who and when (the route audits it too).
  static async updateNote(admissionId, noteId, description, reason, userId) {
    const d = enc({ description, correction_reason: reason }, NOTE_ENC);
    const [result] = await db.execute(
      `UPDATE midwife_notes SET
         original_description = COALESCE(original_description, description),
         description = ?, correction_reason = ?, corrected_at = NOW(), corrected_by = ?
       WHERE id = ? AND admission_id = ?`,
      [d.description, d.correction_reason, userId ?? null, noteId, admissionId]
    );
    return result.affectedRows > 0;
  }

  // ── Pre-discharge checklist ──────────────────────────────────────────────
  static async getChecklist(admissionId) {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS updated_by_name FROM discharge_checklists c
       LEFT JOIN users u ON u.id = c.updated_by WHERE c.admission_id = ?`,
      [admissionId]
    );
    return rows[0] || null;
  }

  static async saveChecklist(admissionId, { items, danger_signs }, userId) {
    await db.execute(
      `INSERT INTO discharge_checklists (admission_id, items, danger_signs, updated_by, updated_at)
       VALUES (?, ?::jsonb, ?::jsonb, ?, NOW())
       ON CONFLICT (admission_id) DO UPDATE SET
         items = EXCLUDED.items, danger_signs = EXCLUDED.danger_signs,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [admissionId, JSON.stringify(items ?? {}), JSON.stringify(danger_signs ?? []), userId ?? null]
    );
    return true;
  }

  // ── Labor chart ──────────────────────────────────────────────────────────
  static async listLabor(admissionId) {
    const [rows] = await db.execute(
      `SELECT l.*, u.name AS recorded_by_name FROM labor_entries l
       LEFT JOIN users u ON u.id = l.recorded_by
       WHERE l.admission_id = ? ORDER BY COALESCE(l.occurred_at, l.recorded_at), l.id`,
      [admissionId]
    );
    return rows.map((r) => dec(r, LABOR_ENC));
  }

  static async addLabor(admissionId, data, userId) {
    const d = enc(data, LABOR_ENC);
    const [result] = await db.execute(
      `INSERT INTO labor_entries (admission_id, contractions, cervix_cm, fetal_heart_rate, membranes, notes, recorded_by,
                                  contraction_freq, contraction_secs, station, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, clean(d.contractions), clean(d.cervix_cm), clean(d.fetal_heart_rate), clean(d.membranes), clean(d.notes), userId ?? null,
       clean(d.contraction_freq), clean(d.contraction_secs), clean(d.station), clean(d.occurred_at)]
    );
    return result.insertId;
  }

  // ── Vital signs ──────────────────────────────────────────────────────────
  static async listVitals(admissionId) {
    const [rows] = await db.execute(
      `SELECT v.*, u.name AS recorded_by_name FROM admission_vitals v
       LEFT JOIN users u ON u.id = v.recorded_by
       WHERE v.admission_id = ? ORDER BY v.recorded_at, v.id`,
      [admissionId]
    );
    return rows;
  }

  static async addVitals(admissionId, v, userId) {
    const [result] = await db.execute(
      `INSERT INTO admission_vitals
         (admission_id, bp_systolic, bp_diastolic, pulse, resp_rate, temperature, spo2, fetal_heart_rate, recorded_by,
          phase, bleeding, uterus, perineum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, clean(v.bp_systolic), clean(v.bp_diastolic), clean(v.pulse), clean(v.resp_rate),
       clean(v.temperature), clean(v.spo2), clean(v.fetal_heart_rate), userId ?? null,
       v.phase || 'admission', clean(v.bleeding), clean(v.uterus), clean(v.perineum)]
    );
    return result.insertId;
  }

  // Counts for reports: admissions, discharges, referrals, average stay, births and newborn screenings.
  static async statsForRange(from, to) {
    const range = "(%s AT TIME ZONE 'Asia/Manila')::date BETWEEN ?::date AND ?::date";
    const one = async (sql, values) => (await db.execute(sql, values))[0][0] || {};
    const [adm, dis, ref, births] = await Promise.all([
      one(`SELECT COUNT(*) AS n FROM admissions WHERE ${range.replace('%s', 'admitted_at')}`, [from, to]),
      one(`SELECT COUNT(*) AS n, AVG(EXTRACT(EPOCH FROM (d.discharged_at - a.admitted_at)) / 3600) AS avg_hours
           FROM discharges d JOIN admissions a ON a.id = d.admission_id WHERE ${range.replace('%s', 'd.discharged_at')}`, [from, to]),
      one(`SELECT COUNT(*) AS n FROM referrals WHERE reversed_at IS NULL AND ${range.replace('%s', 'referred_at')}`, [from, to]),
      one(`SELECT COUNT(*) FILTER (WHERE n.birth_status = 'live') AS live_births,
                  COUNT(*) FILTER (WHERE n.birth_status = 'stillbirth') AS stillbirths,
                  COUNT(*) FILTER (WHERE n.essential_care @> '["newborn_screening"]'::jsonb) AS screenings,
                  COUNT(DISTINCT d.id) AS deliveries
           FROM newborns n JOIN deliveries d ON d.id = n.delivery_id WHERE ${range.replace('%s', 'd.delivered_at')}`, [from, to])
    ]);
    return {
      admissions: Number(adm.n || 0),
      discharges: Number(dis.n || 0),
      averageStayHours: dis.avg_hours === null || dis.avg_hours === undefined ? null : Math.round(Number(dis.avg_hours) * 10) / 10,
      referrals: Number(ref.n || 0),
      deliveries: Number(births.deliveries || 0),
      liveBirths: Number(births.live_births || 0),
      stillbirths: Number(births.stillbirths || 0),
      newbornScreenings: Number(births.screenings || 0)
    };
  }

  // How much has been recorded on each step, so the wizard can show real check marks.
  static async stepCounts(admissionId) {
    const [rows] = await db.execute(
      `SELECT (SELECT COUNT(*) FROM midwife_notes WHERE admission_id = ?) AS notes,
              (SELECT COUNT(*) FROM admission_vitals WHERE admission_id = ? AND bp_systolic IS NOT NULL AND bp_diastolic IS NOT NULL
                 AND pulse IS NOT NULL AND resp_rate IS NOT NULL AND temperature IS NOT NULL) AS complete_vitals,
              (SELECT COUNT(*) FROM labor_entries WHERE admission_id = ?) AS labor`,
      [admissionId, admissionId, admissionId]
    );
    const r = rows[0] || {};
    return { notes: Number(r.notes || 0), completeVitals: Number(r.complete_vitals || 0), labor: Number(r.labor || 0) };
  }

  // ── Medications given (clinical record) ────────────────────────────────
  static async listMedications(admissionId) {
    const [rows] = await db.execute(
      `SELECT m.*, u.name AS given_by_name FROM medications_given m
       LEFT JOIN users u ON u.id = m.given_by WHERE m.admission_id = ? ORDER BY m.given_at, m.id`,
      [admissionId]
    );
    return rows.map((r) => dec(r, MED_ENC));
  }

  static async addMedication(admissionId, m, userId) {
    const d = enc({ note: m.note }, MED_ENC);
    const [result] = await db.execute(
      `INSERT INTO medications_given (admission_id, drug, dose, route, given_at, given_by, item_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [admissionId, m.drug, clean(m.dose), clean(m.route), m.given_at ?? new Date(), userId ?? null, clean(m.item_id), clean(d.note)]
    );
    return result.insertId;
  }

  // ── Bed moves ────────────────────────────────────────────────────────────
  static async logBedMove(admissionId, fromBed, toBed, userId) {
    const [result] = await db.execute(
      'INSERT INTO bed_moves (admission_id, from_bed, to_bed, moved_by) VALUES (?, ?, ?, ?)',
      [admissionId, fromBed ?? null, toBed ?? null, userId ?? null]
    );
    return result.insertId;
  }

  static async listBedMoves(admissionId) {
    const [rows] = await db.execute(
      `SELECT b.*, u.name AS moved_by_name FROM bed_moves b LEFT JOIN users u ON u.id = b.moved_by
       WHERE b.admission_id = ? ORDER BY b.moved_at, b.id`,
      [admissionId]
    );
    return rows;
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
