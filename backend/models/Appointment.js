const db = require('../config/db');

class Appointment {
  // Create a new appointment
  static async create(appointmentData) {
    const { patient_id, appointment_date, reason, status, notes } = appointmentData;
    const query = `
      INSERT INTO appointments (patient_id, appointment_date, reason, status, notes)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [patient_id, appointment_date, reason ?? null, status ?? 'scheduled', notes ?? null];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find all appointments (most recent first)
  static async findAll() {
    const query = 'SELECT * FROM appointments ORDER BY appointment_date DESC';
    const [rows] = await db.execute(query);
    return rows;
  }

  // Find appointment by ID
  static async findById(id) {
    const query = 'SELECT * FROM appointments WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0];
  }

  // Find appointments by patient ID
  static async findByPatientId(patientId) {
    const query = 'SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC';
    const [rows] = await db.execute(query, [patientId]);
    return rows;
  }

  // Find appointments for a specific date (e.g., today)
  static async findByDate(date) {
    // date is a string in 'YYYY-MM-DD' format
    const query = 'SELECT * FROM appointments WHERE DATE(appointment_date) = ? ORDER BY appointment_date';
    const [rows] = await db.execute(query, [date]);
    return rows;
  }

  // Find appointments within a date range (inclusive)
  static async findByDateRange(startDate, endDate) {
    const query = 'SELECT * FROM appointments WHERE DATE(appointment_date) BETWEEN ? AND ? ORDER BY appointment_date';
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows;
  }

  // Update appointment by ID
  static async update(id, appointmentData) {
    const { patient_id, appointment_date, reason, status, notes } = appointmentData;
    const query = `
      UPDATE appointments
      SET patient_id = ?, appointment_date = ?, reason = ?, status = ?, notes = ?
      WHERE id = ?
    `;
    const values = [patient_id, appointment_date, reason ?? null, status ?? null, notes ?? null, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Delete appointment by ID
  static async delete(id) {
    const query = 'DELETE FROM appointments WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Appointment;