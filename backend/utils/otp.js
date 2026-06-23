const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// OTP configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
const BCRYPT_ROUNDS = 10;

/** Load the local clinic logo as a base64 data URI for inline email embedding. */
function loadLocalLogo() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const candidates = [
    { file: 'logo.png', mime: 'image/png' },
    { file: 'logo.jpg', mime: 'image/jpeg' },
    { file: 'logo.jpeg', mime: 'image/jpeg' }
  ];
  for (const { file, mime } of candidates) {
    const logoPath = path.join(assetsDir, file);
    try {
      const data = fs.readFileSync(logoPath);
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      // try next candidate
    }
  }
  return '';
}
const LOCAL_LOGO_URI = loadLocalLogo();

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
  const actionText =
    purpose === 'password_reset'
      ? 'reset your password'
      : 'verify your email and activate your account';
  const subject =
    purpose === 'password_reset'
      ? '[Jean Lying-In Clinic] Your password reset code'
      : '[Jean Lying-In Clinic] Verify your account';

  const clinicName = 'Jean Lying-in Maternity Clinic';
  const clinicAddress = 'Tugan, Juban, Sorsogon';
  // Gmail (and most email clients) block base64 images for security.
  // The logo MUST be hosted on a public URL (Imgur, Cloudinary, S3, etc.)
  // and referenced here via CLINIC_LOGO_URL in backend/.env
  const logoUrl = process.env.CLINIC_LOGO_URL || '';

  const text =
    `${clinicName}\n` +
    `${clinicAddress}\n\n` +
    `${greeting}\n\n` +
    `Please use the one-time code below to ${actionText}:\n\n` +
    `    ${code}\n\n` +
    `This code is valid for ${OTP_EXPIRY_MINUTES} minutes and can only be used once.\n\n` +
    `Please don't share this code with anyone — we'll never ask for it on the phone or via email.\n\n` +
    `If you didn't request this, you can safely ignore this email.\n\n` +
    `Thanks,\nThe Jean Lying-in Maternity Clinic Team`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f8fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="520" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:8px;border:1px solid #e1e4e8;overflow:hidden;">
          <!-- Header / Branding -->
          <tr>
            <td style="padding:32px 32px 16px 32px;text-align:center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="Clinic Logo" width="64" height="64" style="border-radius:50%;margin-bottom:12px;display:inline-block;object-fit:cover;">`
                : `<div style="display:inline-block;width:48px;height:48px;background-color:#0f766e;border-radius:50%;line-height:48px;text-align:center;color:#ffffff;font-size:22px;font-weight:bold;margin-bottom:12px;">J</div>`
              }
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#24292f;">${clinicName}</h1>
              <p style="margin:4px 0 0 0;font-size:13px;color:#57606a;">${clinicAddress}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 32px;"><hr style="border:0;border-top:1px solid #e1e4e8;margin:0;"></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <p style="margin:0 0 12px 0;font-size:15px;color:#24292f;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 20px 0;font-size:15px;color:#24292f;line-height:1.5;">Please use the one-time code below to <strong>${actionText}</strong>:</p>

              <div style="background-color:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:20px;text-align:center;margin-bottom:20px;">
                <p style="margin:0;font-size:32px;font-weight:600;letter-spacing:8px;color:#0f766e;font-family:'SF Mono',Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${code}</p>
              </div>

              <p style="margin:0 0 12px 0;font-size:13px;color:#57606a;line-height:1.5;">This code is valid for <strong>${OTP_EXPIRY_MINUTES} minutes</strong> and can only be used once.</p>
              <p style="margin:0;font-size:13px;color:#57606a;line-height:1.5;">Please don't share this code with anyone — we'll never ask for it on the phone or via email.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 32px 32px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#57606a;line-height:1.5;">If you didn't request this, you can safely ignore this email.</p>
              <p style="margin:16px 0 0 0;font-size:13px;color:#24292f;line-height:1.5;">Thanks,<br><strong>The ${clinicName} Team</strong></p>
            </td>
          </tr>
        </table>

        <!-- Small footer outside card -->
        <p style="margin:16px 0 0 0;font-size:12px;color:#6e7781;text-align:center;">
          &copy; ${new Date().getFullYear()} ${clinicName}. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
