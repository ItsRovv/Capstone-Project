const db = require('../config/db');

class PregnancyTrackingForm {
  static async findByMonthYear(monthYear) {
    const query = 'SELECT * FROM pregnancy_tracking_forms WHERE month_year = ?';
    const [rows] = await db.execute(query, [monthYear]);
    return rows[0] || null;
  }

  static async create(monthYear, rows) {
    const query = 'INSERT INTO pregnancy_tracking_forms (month_year, rows) VALUES (?, ?)';
    const [result] = await db.execute(query, [monthYear, JSON.stringify(rows)]);
    return result.insertId;
  }

  static async update(monthYear, rows) {
    const query = 'UPDATE pregnancy_tracking_forms SET rows = ? WHERE month_year = ?';
    const [result] = await db.execute(query, [JSON.stringify(rows), monthYear]);
    return result.affectedRows > 0;
  }

  // The newest row saved for one patient in any monthly form.
  static async findLatestRowForPatient(patientId) {
    const [forms] = await db.execute('SELECT month_year, rows FROM pregnancy_tracking_forms ORDER BY created_at DESC', []);
    for (const f of forms) {
      let rows = f.rows;
      if (typeof rows === 'string') {
        try { rows = JSON.parse(rows); } catch { rows = []; }
      }
      const row = (rows || []).find((r) => Number(r?.patient_id) === Number(patientId));
      if (row) return { month_year: f.month_year, ...row };
    }
    return null;
  }
}

module.exports = PregnancyTrackingForm;
