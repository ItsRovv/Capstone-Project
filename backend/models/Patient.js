const db = require('../config/db');

class Patient {
  // Create a new patient
  static async create(patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact, allergies } = patientData;
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
    return rows[0];
  }

  // Find all patients with optional search + pagination
  static async findAll(searchTerm = '', { limit, offset } = {}) {
    let query = 'SELECT * FROM patients';
    const values = [];
    if (searchTerm) {
      query += ' WHERE first_name ILIKE ? OR last_name ILIKE ? OR contact_number ILIKE ?';
      const searchPattern = `%${searchTerm}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }
    query += ' ORDER BY created_at DESC';
    if (Number.isInteger(limit)) {
      // LIMIT/OFFSET are inlined as validated integers (mysql2 can't bind them in execute()).
      query += ` LIMIT ${limit} OFFSET ${Number.isInteger(offset) ? offset : 0}`;
    }
    const [rows] = await db.execute(query, values);
    return rows;
  }

  // Count patients matching an optional search term (for pagination totals)
  static async count(searchTerm = '') {
    let query = 'SELECT COUNT(*) AS total FROM patients';
    const values = [];
    if (searchTerm) {
      query += ' WHERE first_name ILIKE ? OR last_name ILIKE ? OR contact_number ILIKE ?';
      const searchPattern = `%${searchTerm}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }
    const [rows] = await db.execute(query, values);
    return rows[0].total;
  }

  // Update patient by ID
  static async update(id, patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact, allergies } = patientData;
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
    return rows;
  }

  // Delete patient by ID. Related consultations are removed automatically via
  // the `ON DELETE CASCADE` foreign key on consultations.patient_id.
  static async delete(id) {
    const [result] = await db.execute('DELETE FROM patients WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Patient;