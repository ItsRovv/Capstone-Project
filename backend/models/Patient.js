const db = require('../config/db');

class Patient {
  // Create a new patient
  static async create(patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact } = patientData;
    const query = `
      INSERT INTO patients (first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [first_name, last_name, date_of_birth ?? null, age ?? null, sex ?? null, address ?? null, contact_number ?? null, emergency_contact ?? null];
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
      query += ' WHERE first_name LIKE ? OR last_name LIKE ? OR contact_number LIKE ?';
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
      query += ' WHERE first_name LIKE ? OR last_name LIKE ? OR contact_number LIKE ?';
      const searchPattern = `%${searchTerm}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }
    const [rows] = await db.execute(query, values);
    return rows[0].total;
  }

  // Update patient by ID
  static async update(id, patientData) {
    const { first_name, last_name, date_of_birth, age, sex, address, contact_number, emergency_contact } = patientData;
    const query = `
      UPDATE patients
      SET first_name = ?, last_name = ?, date_of_birth = ?, age = ?, sex = ?, address = ?, contact_number = ?, emergency_contact = ?
      WHERE id = ?
    `;
    const values = [first_name, last_name, date_of_birth ?? null, age ?? null, sex ?? null, address ?? null, contact_number ?? null, emergency_contact ?? null, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Delete patient by ID
  static async delete(id) {
    const query = 'DELETE FROM patients WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Patient;