const nodemailer = require('nodemailer');

/**
 * Email is entirely optional. If SMTP settings aren't configured, sendMail()
 * becomes a no-op so the rest of the app keeps working without credentials.
 */
function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  return transporter;
}

/**
 * Send an email. Returns true if sent, false if email is not configured.
 */
async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx || !to) {
    console.log('[mailer] SMTP not configured or no recipient — skipping email.');
    return false;
  }
  await tx.sendMail({
    from: process.env.SMTP_FROM || 'Lying-In Clinic <no-reply@clinic.local>',
    to,
    subject,
    text,
    html
  });
  return true;
}

module.exports = { sendMail, isConfigured };
