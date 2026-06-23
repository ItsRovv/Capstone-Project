const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// OTP configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
const BCRYPT_ROUNDS = 10;

/**
 * Generate a cryptographically-random numeric OTP of OTP_LENGTH digits.
 * Returns the plaintext code (to email) — never store this directly.
 */
function generateOtp() {
  const max = 10 ** OTP_LENGTH;
  // crypto.randomInt is uniform and avoids modulo bias.
  const n = crypto.randomInt(0, max);
  return String(n).padStart(OTP_LENGTH, '0');
}

/** Hash an OTP for storage. */
async function hashOtp(code) {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

/** Compare a submitted OTP against the stored hash. */
async function compareOtp(code, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(code), hash);
}

/** A Date OTP_EXPIRY_MINUTES from now. */
function otpExpiry() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

/**
 * Build the email subject + body for an OTP.
 * @param {'password_reset'|'email_verify'} purpose
 * @param {string} code
 * @param {string} name
 */
function buildOtpEmail(purpose, code, name = '') {
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const action =
    purpose === 'password_reset'
      ? 'reset your password'
      : 'verify your email and activate your account';
  const subject =
    purpose === 'password_reset'
      ? 'Your password reset code'
      : 'Verify your clinic account';

  const text =
    `${greeting}\n\n` +
    `Use this one-time code to ${action}:\n\n` +
    `    ${code}\n\n` +
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes. ` +
    `If you didn't request this, you can safely ignore this email.\n\n` +
    `— Jean Lying-in Maternity Clinic`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">` +
    `<h2 style="color:#0f766e;margin-bottom:4px">Jean Lying-in Maternity Clinic</h2>` +
    `<p>${greeting}</p>` +
    `<p>Use this one-time code to ${action}:</p>` +
    `<p style="font-size:30px;font-weight:bold;letter-spacing:6px;background:#f0fdfa;` +
    `border:1px solid #99f6e4;border-radius:10px;padding:16px;text-align:center;color:#0f766e">${code}</p>` +
    `<p style="color:#6b7280;font-size:13px">This code expires in ${OTP_EXPIRY_MINUTES} minutes. ` +
    `If you didn't request this, you can safely ignore this email.</p>` +
    `</div>`;

  return { subject, text, html };
}

module.exports = {
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  generateOtp,
  hashOtp,
  compareOtp,
  otpExpiry,
  buildOtpEmail
};
