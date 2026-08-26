const db = require('../config/db');

class Queue {
  // Add a patient to today's queue — assigns next available number
  static async add(patientId) {
    const today = new Date().toISOString().split('T')[0];
    const [maxRow] = await db.execute(
      'SELECT COALESCE(MAX(queue_number), 0) AS max_num FROM queue_entries WHERE entry_date = ?',
      [today]
    );
    const nextNumber = (maxRow[0]?.max_num || 0) + 1;

    const query = `
      INSERT INTO queue_entries (patient_id, queue_number, entry_date, status)
      VALUES (?, ?, ?, 'waiting')
    `;
    const [result] = await db.execute(query, [patientId, nextNumber, today]);
    return { id: result.insertId, queue_number: nextNumber };
  }

  // Find queue entry by ID
  static async findById(id) {
    const query = 'SELECT * FROM queue_entries WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  // List today's queue with patient names, ordered by queue_number
  static async listToday() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT q.*, p.first_name, p.last_name
      FROM queue_entries q
      JOIN patients p ON p.id = q.patient_id
      WHERE q.entry_date = ?
      ORDER BY q.queue_number ASC
    `;
    const [rows] = await db.execute(query, [today]);
    return rows;
  }

  // Find today's active queue entry for a specific patient (if any)
  static async findByPatientToday(patientId) {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT * FROM queue_entries
      WHERE patient_id = ? AND entry_date = ? AND status IN ('waiting', 'serving')
      ORDER BY queue_number DESC LIMIT 1
    `;
    const [rows] = await db.execute(query, [patientId, today]);
    return rows[0] || null;
  }

  // Update status (serving, done, skipped)
  static async updateStatus(id, status, servedBy = null) {
    const query = `
      UPDATE queue_entries
      SET status = ?, served_by = ?
      WHERE id = ?
    `;
    const [result] = await db.execute(query, [status, servedBy, id]);
    return result.affectedRows > 0;
  }

  // Remove from queue
  static async delete(id) {
    const query = 'DELETE FROM queue_entries WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  // Find today's serving queue entry (if any)
  static async findServingToday() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT q.*, p.first_name, p.last_name
      FROM queue_entries q
      JOIN patients p ON p.id = q.patient_id
      WHERE q.entry_date = ? AND q.status = 'serving'
      ORDER BY q.queue_number ASC
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [today]);
    return rows[0] || null;
  }

  // Find next waiting patient today
  static async findNextWaiting() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT q.*, p.first_name, p.last_name
      FROM queue_entries q
      JOIN patients p ON p.id = q.patient_id
      WHERE q.entry_date = ? AND q.status = 'waiting'
      ORDER BY q.queue_number ASC
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [today]);
    return rows[0] || null;
  }

  // Count waiting patients today
  static async countWaitingToday() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT COUNT(*) AS count FROM queue_entries
      WHERE entry_date = ? AND status = 'waiting'
    `;
    const [rows] = await db.execute(query, [today]);
    return rows[0]?.count || 0;
  }
}

module.exports = Queue;
