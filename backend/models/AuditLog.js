const db = require('../config/db');

class AuditLog {
  /**
   * Create an audit log entry.
   */
  static async create({ userId, action, tableName, recordId, oldData, newData, ipAddress }) {
    const query = `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, ip_address)
      VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
    `;
    const values = [
      userId ?? null,
      action,
      tableName ?? null,
      recordId ?? null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress ?? null
    ];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  /**
   * List audit logs with optional filtering and pagination.
   */
  static async findAll({ tableName, recordId, userId, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM audit_logs';
    const conditions = [];
    const values = [];

    if (tableName) {
      conditions.push('table_name = ?');
      values.push(tableName);
    }
    if (recordId) {
      conditions.push('record_id = ?');
      values.push(recordId);
    }
    if (userId) {
      conditions.push('user_id = ?');
      values.push(userId);
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';
    query += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const [rows] = await db.execute(query, values);
    return rows;
  }

  /**
   * Count audit logs matching filters.
   */
  static async count({ tableName, recordId, userId } = {}) {
    let query = 'SELECT COUNT(*) AS total FROM audit_logs';
    const conditions = [];
    const values = [];

    if (tableName) {
      conditions.push('table_name = ?');
      values.push(tableName);
    }
    if (recordId) {
      conditions.push('record_id = ?');
      values.push(recordId);
    }
    if (userId) {
      conditions.push('user_id = ?');
      values.push(userId);
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await db.execute(query, values);
    return rows[0].total;
  }
}

module.exports = AuditLog;
