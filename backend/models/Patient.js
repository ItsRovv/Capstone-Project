const db = require('../config/db');
const { encryptObject, decryptObject, encryptDeterministic } = require('../utils/encryption');

// Fields encrypted with randomized AES-256-GCM
const ENCRYPTED_FIELDS = ['address', 'allergies', 'emergency_contact'];
// Fields encrypted deterministically so exact-match lookup still works
const DETERMINISTIC_FIELDS = ['contact_number'];

function encryptPatient(data) {
  return encryptObject(data, [...ENCRYPTED_FIELDS, ...DETERMINISTIC_FIELDS], {
    deterministic: DETERMINISTIC_FIELDS
  });
}

function decryptPatient(data) {
  return decryptObject(data, [...ENCRYPTED_FIELDS, ...DETERMINISTIC_FIELDS], {
    deterministic: DETERMINISTIC_FIELDS
  });
}

class Patient {
  // Create a new patient
  static async create(patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact, allergies } = encryptPatient(patientData);
    const query = `
      INSERT INTO patients (first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact, allergies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [first_name, last_name, date_of_birth ?? null, age ?? null, sex ?? null, address ?? null, contact_number ?? null, emergency_contact ?? null, allergies ?? null];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find patient by ID
  static async findById(id) {
    const query = 'SELECT * FROM patients WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0] ? decryptPatient(rows[0]) : null;
  }

  // Find all patients with optional search + pagination
  static async findAll(searchTerm = '', { limit, offset } = {}) {
    let query = 'SELECT * FROM patients';
    const values = [];
    if (searchTerm) {
      // first_name/last_name are plaintext; contact_number is deterministically encrypted
      const searchPattern = `%${searchTerm}%`;
      const encryptedContact = encryptDeterministic(searchTerm);
      query += ' WHERE first_name ILIKE ? OR last_name ILIKE ? OR contact_number = ?';
      values.push(searchPattern, searchPattern, encryptedContact);
    }
    query += ' ORDER BY created_at DESC';
    if (Number.isInteger(limit)) {
      // LIMIT/OFFSET are inlined as validated integers (mysql2 can't bind them in execute()).
      query += ` LIMIT ${limit} OFFSET ${Number.isInteger(offset) ? offset : 0}`;
    }
    const [rows] = await db.execute(query, values);
    return rows.map(decryptPatient);
  }

  // Count patients matching an optional search term (for pagination totals)
  static async count(searchTerm = '') {
    let query = 'SELECT COUNT(*) AS total FROM patients';
    const values = [];
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      const encryptedContact = encryptDeterministic(searchTerm);
      query += ' WHERE first_name ILIKE ? OR last_name ILIKE ? OR contact_number = ?';
      values.push(searchPattern, searchPattern, encryptedContact);
    }
    const [rows] = await db.execute(query, values);
    return rows[0].total;
  }

  // Update patient by ID
  static async update(id, patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact, allergies } = encryptPatient(patientData);
    const query = `
      UPDATE patients
      SET first_name = ?, last_name = ?, date_of_birth = ?, age = ?, sex = ?, address = ?, contact_number = ?, emergency_contact = ?, allergies = ?
      WHERE id = ?
    `;
    const values = [first_name, last_name, date_of_birth ?? null, age ?? null, sex ?? null, address ?? null, contact_number ?? null, emergency_contact ?? null, allergies ?? null, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Find patients with ongoing pregnancies (active patients in the clinic)
  static async findActive() {
    const query = `
      SELECT DISTINCT ON (p.id)
        p.*, pr.id as pregnancy_id, pr.lmp, pr.edd, pr.gp, pr.trimester, pr.weeks, pr.status as pregnancy_status
      FROM patients p
      INNER JOIN pregnancies pr ON pr.patient_id = p.id
      WHERE pr.status = 'Ongoing'
      ORDER BY p.id, pr.created_at DESC
    `;
    const [rows] = await db.execute(query);
    return rows.map((row) => {
      // Decrypt only the patient fields; pregnancy fields are unencrypted
      const patientFields = {};
      for (const key of Object.keys(row)) {
        if (!['pregnancy_id', 'lmp', 'edd', 'gp', 'trimester', 'weeks', 'pregnancy_status'].includes(key)) {
          patientFields[key] = row[key];
        }
      }
      const decryptedPatient = decryptPatient(patientFields);
      return { ...decryptedPatient, pregnancy_id: row.pregnancy_id, lmp: row.lmp, edd: row.edd, gp: row.gp, trimester: row.trimester, weeks: row.weeks, pregnancy_status: row.pregnancy_status };
    });
  }

  // Delete patient by ID. Related consultations are removed automatically via
  // the `ON DELETE CASCADE` foreign key on consultations.patient_id.
  static async delete(id) {
    const [result] = await db.execute('DELETE FROM patients WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Patient;