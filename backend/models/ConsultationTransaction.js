const db = require('../config/db');
const { encryptObject, decryptObject } = require('../utils/encryption');

const ENCRYPTED_FIELDS = ['recommendations'];

function encryptTransaction(data) {
  return encryptObject(data, ENCRYPTED_FIELDS);
}

function decryptTransaction(data) {
  return decryptObject(data, ENCRYPTED_FIELDS);
}

function parsePackages(row) {
  if (row && typeof row.packages === 'string') {
    try { row.packages = JSON.parse(row.packages); } catch { row.packages = []; }
  }
  if (row && typeof row.vitamins === 'string') {
    try { row.vitamins = JSON.parse(row.vitamins); } catch { row.vitamins = []; }
  }
  return row;
}

class ConsultationTransaction {
  // Create a new transaction
  static async create(data) {
    const { patient_id, consultation_id, created_by, transaction_date, packages, vitamins, recommendations, total_amount, philhealth_total } = encryptTransaction(data);
    const query = `
      INSERT INTO consultation_transactions (patient_id, consultation_id, created_by, transaction_date, packages, vitamins, recommendations, total_amount, philhealth_total)
      VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)
    `;
    const values = [
      patient_id,
      consultation_id ?? null,
      created_by ?? null,
      transaction_date ?? new Date(),
      JSON.stringify(packages ?? []),
      JSON.stringify(vitamins ?? []),
      recommendations ?? null,
      total_amount ?? 0,
      philhealth_total ?? 0
    ];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find all transactions
  static async findAll() {
    const query = 'SELECT * FROM consultation_transactions ORDER BY transaction_date DESC';
    const [rows] = await db.execute(query, []);
    return rows.map((r) => decryptTransaction(parsePackages(r)));
  }

  // Find transaction by ID
  static async findById(id) {
    const query = 'SELECT * FROM consultation_transactions WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0] ? decryptTransaction(parsePackages(rows[0])) : null;
  }

  // Find all transactions for a patient
  static async findByPatientId(patientId) {
    const query = 'SELECT * FROM consultation_transactions WHERE patient_id = ? ORDER BY transaction_date DESC';
    const [rows] = await db.execute(query, [patientId]);
    return rows.map((r) => decryptTransaction(parsePackages(r)));
  }

  // Find all transactions linked to a specific consultation
  static async findByConsultationId(consultationId) {
    const query = 'SELECT * FROM consultation_transactions WHERE consultation_id = ? ORDER BY transaction_date DESC';
    const [rows] = await db.execute(query, [consultationId]);
    return rows.map((r) => decryptTransaction(parsePackages(r)));
  }

  // Update transaction by ID
  static async update(id, data) {
    const { patient_id, consultation_id, transaction_date, packages, vitamins, recommendations, total_amount, philhealth_total } = encryptTransaction(data);
    const query = `
      UPDATE consultation_transactions
      SET patient_id = ?, consultation_id = ?, transaction_date = ?, packages = ?::jsonb, vitamins = ?::jsonb, recommendations = ?, total_amount = ?, philhealth_total = ?
      WHERE id = ?
    `;
    const values = [
      patient_id,
      consultation_id ?? null,
      transaction_date ?? null,
      JSON.stringify(packages ?? []),
      JSON.stringify(vitamins ?? []),
      recommendations ?? null,
      total_amount ?? 0,
      philhealth_total ?? 0,
      id
    ];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Delete transaction by ID
  static async delete(id) {
    const query = 'DELETE FROM consultation_transactions WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = ConsultationTransaction;
