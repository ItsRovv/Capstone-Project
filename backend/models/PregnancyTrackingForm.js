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
}

module.exports = PregnancyTrackingForm;
