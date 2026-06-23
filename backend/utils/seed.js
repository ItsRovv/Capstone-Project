/**
 * Seed script — creates a default admin if no users exist.
 * Run with: `npm run seed`
 *
 * IMPORTANT: Change the default password immediately after first login.
 * The password is printed once here and never stored in plaintext.
 * After the first login, use the "Manage Users" admin panel to update it.
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../config/db');
const User = require('../models/User');

// Use SEED_ADMIN_PASSWORD env var if set (useful for CI / automated deployments),
// otherwise generate a cryptographically random one-time password.
function buildDefaultAdmin() {
  const password = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  return {
    name: 'Clinic Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@clinic.local',
    password,
    role: 'admin'
  };
}

async function run() {
  await db.ready();
  const count = await User.count();
  if (count > 0) {
    console.log(`✓ Skipping seed — ${count} user(s) already exist.`);
    process.exit(0);
  }

  const admin = buildDefaultAdmin();
  // Auto-verify the seeded admin so first login works without SMTP in dev.
  const id = await User.create({ ...admin, email_verified: true });

  console.log('✓ Default admin created.');
  console.log(`   id:    ${id}`);
  console.log(`   email: ${admin.email}`);
  // Only print the one-time password during initial setup — it is not stored anywhere else.
  console.log(`   password (one-time): ${admin.password}`);
  console.log('   *** Change this password immediately after first login! ***');
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
