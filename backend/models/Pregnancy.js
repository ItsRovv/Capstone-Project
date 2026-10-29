const db = require('../config/db');

// Auto-compute BMI (kg/m²) from weight (kg) and height (cm) when both are present.
function computeBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  if (!heightM) return null;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

class Pregnancy {
  static async create(patientId, data) {
    const {
      lmp, edd, gp, trimester, weeks, status, notes,
      baseline_weight_kg, baseline_height_cm, aog, ob_index, blood_type,
      pregnancy_number, first_visit_date
    } = data;
    const baseline_bmi = data.baseline_bmi ?? computeBmi(baseline_weight_kg, baseline_height_cm);
    const query = `
      INSERT INTO pregnancies (
        patient_id, lmp, edd, gp, trimester, weeks, status, notes,
        baseline_weight_kg, baseline_height_cm, baseline_bmi, aog, ob_index,
        blood_type, pregnancy_number, first_visit_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      patientId, lmp ?? null, edd ?? null, gp ?? null, trimester ?? null, weeks ?? null, status ?? null, notes ?? null,
      baseline_weight_kg ?? null, baseline_height_cm ?? null, baseline_bmi ?? null, aog ?? null, ob_index ?? null,
      blood_type ?? null, pregnancy_number ?? null, first_visit_date ?? null
    ];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  static async findByPatientId(patientId) {
    const query = 'SELECT * FROM pregnancies WHERE patient_id = ? ORDER BY created_at DESC';
    const [rows] = await db.execute(query, [patientId]);
    return rows;
  }

  static async findById(id) {
    const query = 'SELECT * FROM pregnancies WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0];
  }

  static async update(id, data) {
    const {
      lmp, edd, gp, trimester, weeks, status, notes,
      baseline_weight_kg, baseline_height_cm, aog, ob_index, blood_type,
      pregnancy_number, first_visit_date
    } = data;
    const baseline_bmi = data.baseline_bmi ?? computeBmi(baseline_weight_kg, baseline_height_cm);
    const query = `
      UPDATE pregnancies
      SET lmp = ?, edd = ?, gp = ?, trimester = ?, weeks = ?, status = ?, notes = ?,
          baseline_weight_kg = ?, baseline_height_cm = ?, baseline_bmi = ?, aog = ?,
          ob_index = ?, blood_type = ?, pregnancy_number = ?, first_visit_date = ?
      WHERE id = ?
    `;
    const values = [
      lmp ?? null, edd ?? null, gp ?? null, trimester ?? null, weeks ?? null, status ?? null, notes ?? null,
      baseline_weight_kg ?? null, baseline_height_cm ?? null, baseline_bmi ?? null, aog ?? null,
      ob_index ?? null, blood_type ?? null, pregnancy_number ?? null, first_visit_date ?? null, id
    ];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM pregnancies WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Find pregnancies created on a specific date (for daily reports)
  static async findByDate(date) {
    const query = `SELECT * FROM pregnancies WHERE created_at::date = ? ORDER BY created_at DESC`;
    const [rows] = await db.execute(query, [date]);
    return rows;
  }

  // Find pregnancies created within an inclusive date range (for weekly reports)
  static async findByDateRange(startDate, endDate) {
    const query = `SELECT * FROM pregnancies WHERE created_at::date BETWEEN ? AND ? ORDER BY created_at DESC`;
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows;
  }

  // Find all active pregnancies (status not discharged/delivered)
  static async findActive() {
    const query = `SELECT * FROM pregnancies WHERE COALESCE(LOWER(status), '') NOT IN ('delivered', 'discharged', 'completed') ORDER BY created_at DESC`;
    const [rows] = await db.execute(query, []);
    return rows;
  }
}

module.exports = Pregnancy;
