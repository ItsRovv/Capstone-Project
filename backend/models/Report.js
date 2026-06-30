const db = require('../config/db');

class Report {
  // Save a report
  static async save(reportData) {
    const { date, report_type, ai_generated_text, total_patients, metrics } = reportData;
    const query = `
      INSERT INTO clinic_reports (report_date, report_type, ai_generated_text, total_patients, metrics)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [
      date,
      report_type,
      typeof ai_generated_text === 'object'
        ? JSON.stringify(ai_generated_text)
        : (ai_generated_text ?? null),
      total_patients ?? null,
      metrics ? JSON.stringify(metrics) : null
    ];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find report by date and type
  static async findByDateAndType(date, reportType = 'daily') {
    const query = 'SELECT * FROM clinic_reports WHERE report_date = ? AND report_type = ? ORDER BY created_at DESC LIMIT 1';
    const [rows] = await db.execute(query, [date, reportType]);
    if (rows[0]?.metrics && typeof rows[0].metrics === 'string') {
      try { rows[0].metrics = JSON.parse(rows[0].metrics); } catch { /* leave as string */ }
    }
    return rows[0];
  }

  // Find reports by date range
  static async findByDateRange(startDate, endDate) {
    const query = 'SELECT * FROM clinic_reports WHERE report_date BETWEEN ? AND ? ORDER BY report_date DESC';
    const [rows] = await db.execute(query, [startDate, endDate]);
    for (const row of rows) {
      if (row.metrics && typeof row.metrics === 'string') {
        try { row.metrics = JSON.parse(row.metrics); } catch { /* leave as string */ }
      }
    }
    return rows;
  }
}

module.exports = Report;
