const db = require('../config/db');
const bcrypt = require('bcryptjs');

// A fixed bcrypt hash used for timing-safe "user not found" responses.
// Pre-computed once at startup — takes the same time as a real compare
// so attackers cannot enumerate valid emails via response timing.
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('__dummy_password_never_matches__', BCRYPT_ROUNDS);

class User {
  // Create a new user (for registration)
  static async create(userData) {
    const { name, email, password, role = 'staff' } = userData;
    // Hash password with a strong cost factor (12 rounds ≈ 200–400 ms)
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const query = `
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `;
    const values = [name, email, password_hash, role];
    const [result] = await db.execute(query, values);
    return result.insertId;
  }

  // Find user by email
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = ?';
    const [rows] = await db.execute(query, [email]);
    return rows[0];
  }

  // Find user by ID
  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await db.execute(query, [id]);
    return rows[0];
  }

  // Find all users (without password_hash)
  static async findAll() {
    const query = 'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY created_at DESC';
    const [rows] = await db.execute(query);
    return rows;
  }

  // Count users
  static async count() {
    const query = 'SELECT COUNT(*) AS total FROM users';
    const [rows] = await db.execute(query);
    return rows[0].total;
  }

  // Compare password for login
  static async comparePassword(password, password_hash) {
    return bcrypt.compare(password, password_hash);
  }

  /**
   * Run a bcrypt compare against a dummy hash so that "user not found" responses
   * take the same wall-clock time as a real failed login, preventing user enumeration
   * via timing side-channel.
   */
  static async dummyCompare() {
    await bcrypt.compare('__probe__', DUMMY_HASH);
  }

  /**
   * Increment the failed login counter for a user.
   * If the threshold is reached, set locked_until to now + lockoutMinutes.
   */
  static async incrementFailedLogin(id, maxAttempts, lockoutMinutes) {
    const query = `
      UPDATE users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
            ELSE locked_until
          END
      WHERE id = ?
    `;
    await db.execute(query, [maxAttempts, lockoutMinutes, id]);
  }

  /**
   * Reset the failed login counter and clear any lockout after a successful login.
   */
  static async resetFailedLogin(id) {
    const query = 'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?';
    await db.execute(query, [id]);
  }

  // Update user (e.g., name, email, role, or password)
  static async update(id, userData) {
    const { name, email, role } = userData;

    if (userData.password) {
      const password_hash = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);
      const query =
        'UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?';
      const values = [name ?? null, email ?? null, password_hash, role ?? null, id];
      const [result] = await db.execute(query, values);
      return result.affectedRows > 0;
    }

    const query = 'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?';
    const values = [name ?? null, email ?? null, role ?? null, id];
    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Delete user by ID
  static async delete(id) {
    const query = 'DELETE FROM users WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;