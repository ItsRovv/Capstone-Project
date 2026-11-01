const db = require('../config/db');
const { encryptObject, decryptObject } = require('../utils/encryption');

const ENCRYPTED_FIELDS = ['raw_notes', 'structured_notes', 'chief_complaint', 'diagnosis', 'prescription', 'subjective', 'objective', 'assessment', 'plan', 'prenatal_data', 'postnatal_data'];
// Fields that store a JSON object/array as an encrypted string — stringified
// before encryption, parsed back after decryption.
const JSON_FIELDS = ['prenatal_data', 'postnatal_data'];

function stringifyJsonFields(data) {
  const result = { ...data };
  for (const field of JSON_FIELDS) {
    if (result[field] !== undefined && result[field] !== null && typeof result[field] !== 'string') {
      result[field] = JSON.stringify(result[field]);
    }
  }
  return result;
}

function parseJsonFields(data) {
  const result = { ...data };
  for (const field of JSON_FIELDS) {
    if (typeof result[field] === 'string' && result[field].length) {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        // Leave as-is if not valid JSON (e.g. legacy/corrupt data)
      }
    }
  }
  return result;
}

function encryptConsultation(data) {
  return encryptObject(stringifyJsonFields(data), ENCRYPTED_FIELDS);
}

function decryptConsultation(data) {
  return parseJsonFields(decryptObject(data, ENCRYPTED_FIELDS));
}

class Consultation {
  // Create a new consultation
  static async create(consultationData) {
    const { patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, subjective, objective, assessment, plan, delivery_location, consultation_type, prenatal_data, postnatal_data, ai_summary_used } = encryptConsultation(consultationData);
    const query = `
      INSERT INTO consultations (patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, subjective, objective, assessment, plan, delivery_location, consultation_type, prenatal_data, postnatal_data, ai_summary_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [patient_id, doctor_id ?? null, visit_date ?? new Date(), raw_notes ?? null, structured_notes ?? null, chief_complaint ?? null, diagnosis ?? null, prescription ?? null, subjective ?? null, objective ?? null, assessment ?? null, plan ?? null, delivery_location ?? null, consultation_type ?? 'normal', prenatal_data ?? null, postnatal_data ?? null, ai_summary_used ?? false];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find consultation by ID
  static async findById(id) {
    const query = 'SELECT * FROM consultations WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0] ? decryptConsultation(rows[0]) : null;
  }

  // Find consultations by patient ID
  static async findByPatientId(patientId) {
    const query = 'SELECT * FROM consultations WHERE patient_id = ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [patientId]);
    return rows.map(decryptConsultation);
  }

  // Find most recent consultations across all patients (for dashboard)
  static async findRecent(limit = 6) {
    const query = `
      SELECT c.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
      FROM consultations c
      JOIN patients p ON p.id = c.patient_id
      ORDER BY c.visit_date DESC
      LIMIT ?
    `;
    const [rows] = await db.execute(query, [limit]);
    return rows.map((r) => {
      const { patient_first_name, patient_last_name, ...rest } = r;
      return {
        ...decryptConsultation(rest),
        patient_first_name,
        patient_last_name
      };
    });
  }

  // Find today's consultations with patient names (for doctor view)
  static async findTodayDetailed() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT c.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name
      FROM consultations c
      JOIN patients p ON p.id = c.patient_id
      WHERE c.visit_date::date = ?
      ORDER BY c.visit_date DESC
    `;
    const [rows] = await db.execute(query, [today]);
    return rows.map((r) => {
      const { patient_first_name, patient_last_name, ...rest } = r;
      return {
        ...decryptConsultation(rest),
        patient_first_name,
        patient_last_name
      };
    });
  }

  // Find consultations by date (for reports)
  static async findByDate(date) {
    // date is a string in 'YYYY-MM-DD' format
    const query = 'SELECT * FROM consultations WHERE visit_date::date = ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [date]);
    return rows.map(decryptConsultation);
  }

  // Find consultations within an inclusive date range (for weekly reports)
  static async findByDateRange(startDate, endDate) {
    const query =
      'SELECT * FROM consultations WHERE visit_date::date BETWEEN ? AND ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows.map(decryptConsultation);
  }

  // Update consultation by ID
  static async update(id, consultationData) {
    const { patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, subjective, objective, assessment, plan, delivery_location, consultation_type, prenatal_data, postnatal_data, ai_summary_used } = encryptConsultation(consultationData);
    const query = `
      UPDATE consultations
      SET patient_id = ?, doctor_id = ?, visit_date = ?, raw_notes = ?, structured_notes = ?, chief_complaint = ?, diagnosis = ?, prescription = ?, subjective = ?, objective = ?, assessment = ?, plan = ?, delivery_location = ?, consultation_type = ?, prenatal_data = ?, postnatal_data = ?, ai_summary_used = ?
      WHERE id = ?
    `;
    const values = [patient_id, doctor_id ?? null, visit_date ?? null, raw_notes ?? null, structured_notes ?? null, chief_complaint ?? null, diagnosis ?? null, prescription ?? null, subjective ?? null, objective ?? null, assessment ?? null, plan ?? null, delivery_location ?? null, consultation_type ?? 'normal', prenatal_data ?? null, postnatal_data ?? null, ai_summary_used ?? false, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Delete consultation by ID
  static async delete(id) {
    const query = 'DELETE FROM consultations WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Consultation;