const db = require('../config/db');

class Pregnancy {
  static async create(patientId, data) {
    const { lmp, edd, gp, trimester, weeks, status, notes } = data;
    const query = `
      INSERT INTO pregnancies (patient_id, lmp, edd, gp, trimester, weeks, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [patientId, lmp ?? null, edd ?? null, gp ?? null, trimester ?? null, weeks ?? null, status ?? null, notes ?? null];
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
    const { lmp, edd, gp, trimester, weeks, status, notes } = data;
    const query = `
      UPDATE pregnancies
      SET lmp = ?, edd = ?, gp = ?, trimester = ?, weeks = ?, status = ?, notes = ?
      WHERE id = ?
    `;
    const values = [lmp ?? null, edd ?? null, gp ?? null, trimester ?? null, weeks ?? null, status ?? null, notes ?? null, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM pregnancies WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Pregnancy;
