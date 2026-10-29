const db = require('../config/db');

class ClinicOption {
  static async list({ group, includeInactive = false } = {}) {
    const conditions = [];
    const values = [];
    if (group) { conditions.push('option_group = ?'); values.push(group); }
    if (!includeInactive) conditions.push('active = TRUE');
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.execute(
      `SELECT * FROM clinic_options${where} ORDER BY option_group, sort_order, label`,
      values
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM clinic_options WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByGroupCode(group, code) {
    const [rows] = await db.execute(
      'SELECT * FROM clinic_options WHERE option_group = ? AND code = ?',
      [group, code]
    );
    return rows[0] || null;
  }

  static async create({ option_group, code, label, price, category, active, sort_order }) {
    const finalCode = code || slugify(label);
    const [result] = await db.execute(
      `INSERT INTO clinic_options (option_group, code, label, price, category, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        option_group,
        finalCode,
        label,
        price === '' || price === undefined ? null : price,
        category || null,
        active ?? true,
        sort_order ?? 999
      ]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const columns = ['label', 'price', 'category', 'active', 'sort_order'];
    const sets = [];
    const values = [];
    for (const col of columns) {
      if (data[col] === undefined) continue;
      sets.push(`${col} = ?`);
      values.push(col === 'price' && data[col] === '' ? null : data[col]);
    }
    if (!sets.length) return false;
    values.push(id);
    const [result] = await db.execute(`UPDATE clinic_options SET ${sets.join(', ')} WHERE id = ?`, values);
    return result.affectedRows > 0;
  }

  // Never hard-delete: past records may refer to the option. Hide it instead.
  static async deactivate(id) {
    const [result] = await db.execute('UPDATE clinic_options SET active = FALSE WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getSettings() {
    const [rows] = await db.execute("SELECT setting_key, setting_value, description FROM clinic_settings WHERE setting_key NOT LIKE 'migr\_%' ORDER BY id", []);
    return rows;
  }

  static async getSettingsMap() {
    const rows = await ClinicOption.getSettings();
    return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  }

  static async setSetting(key, value) {
    const [result] = await db.execute(
      'UPDATE clinic_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?',
      [String(value), key]
    );
    return result.affectedRows > 0;
  }
}

function slugify(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || `option_${Date.now()}`;
}

module.exports = ClinicOption;
module.exports.slugify = slugify;
