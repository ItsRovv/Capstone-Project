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
    const isDev = process.env.NODE_ENV !== 'production';
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      // In development, allow self-signed certs so Gmail TLS doesn't block localhost
      tls: isDev ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    // Verify the connection on first build so errors surface immediately
    transporter.verify((err) => {
      if (err) {
        console.error('[mailer] SMTP connection failed:', err.message);
        if (err.message.includes('Invalid login')) {
          console.error('[mailer] Hint: if using Gmail, generate an App Password at https://myaccount.google.com/apppasswords');
        }
        if (err.message.includes('application-specific password')) {
          console.error('[mailer] Hint: Gmail requires an App Password. Your regular Gmail password will not work.');
        }
      } else {
        console.log('[mailer] SMTP connection verified — ready to send');
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
    return { sent: false, error: 'SMTP not configured' };
  }
  try {
    const info = await tx.sendMail({
      from: process.env.SMTP_FROM || 'Lying-In Clinic <no-reply@clinic.local>',
      to,
      subject,
      text,
      html
    });
    console.log(`[mailer] Email sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
