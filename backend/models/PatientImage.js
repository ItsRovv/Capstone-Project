const db = require('../config/db');

// Result images (ultrasound, lab printouts) attached to a patient.
class PatientImage {
  static async listByPatient(patientId) {
    const [rows] = await db.execute(
      `SELECT id, patient_id, pregnancy_id, label, mime, uploaded_by, created_at, octet_length(data) AS size
       FROM patient_images WHERE patient_id = ? ORDER BY created_at DESC`,
      [patientId]
    );
    return rows;
  }

  static async create({ patient_id, pregnancy_id, label, mime, data, uploaded_by }) {
    const [result] = await db.execute(
      'INSERT INTO patient_images (patient_id, pregnancy_id, label, mime, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [patient_id, pregnancy_id ?? null, label, mime, data, uploaded_by ?? null]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM patient_images WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async remove(id) {
    const [result] = await db.execute('DELETE FROM patient_images WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = PatientImage;
