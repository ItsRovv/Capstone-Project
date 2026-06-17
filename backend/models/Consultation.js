const db = require('../config/db');

class Consultation {
  // Create a new consultation
  static async create(consultationData) {
    const { patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, ai_summary_used } = consultationData;
    const query = `
      INSERT INTO consultations (patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, ai_summary_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [patient_id, doctor_id ?? null, visit_date ?? new Date(), raw_notes ?? null, structured_notes ?? null, chief_complaint ?? null, diagnosis ?? null, prescription ?? null, ai_summary_used ?? false];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find consultation by ID
  static async findById(id) {
    const query = 'SELECT * FROM consultations WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0];
  }

  // Find consultations by patient ID
  static async findByPatientId(patientId) {
    const query = 'SELECT * FROM consultations WHERE patient_id = ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [patientId]);
    return rows;
  }

  // Find consultations by date (for reports)
  static async findByDate(date) {
    // date is a string in 'YYYY-MM-DD' format
    const query = 'SELECT * FROM consultations WHERE DATE(visit_date) = ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [date]);
    return rows;
  }

  // Find consultations within an inclusive date range (for weekly reports)
  static async findByDateRange(startDate, endDate) {
    const query =
      'SELECT * FROM consultations WHERE DATE(visit_date) BETWEEN ? AND ? ORDER BY visit_date DESC';
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows;
  }

  // Update consultation by ID
  static async update(id, consultationData) {
    const { patient_id, doctor_id, visit_date, raw_notes, structured_notes, chief_complaint, diagnosis, prescription, ai_summary_used } = consultationData;
    const query = `
      UPDATE consultations
      SET patient_id = ?, doctor_id = ?, visit_date = ?, raw_notes = ?, structured_notes = ?, chief_complaint = ?, diagnosis = ?, prescription = ?, ai_summary_used = ?
      WHERE id = ?
    `;
    const values = [patient_id, doctor_id ?? null, visit_date ?? null, raw_notes ?? null, structured_notes ?? null, chief_complaint ?? null, diagnosis ?? null, prescription ?? null, ai_summary_used ?? false, id];
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