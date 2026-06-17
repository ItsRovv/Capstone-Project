const cron = require('node-cron');
const { generateDailyReport } = require('../services/reportService');
const { sendMail, isConfigured } = require('./mailer');

const REPORT_CRON = process.env.REPORT_CRON || '0 18 * * *'; // 6:00 PM daily by default
const REPORT_EMAIL = process.env.REPORT_EMAIL || '';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate today's daily report and (optionally) email it to the clinic owner.
 * Exposed separately so it can be triggered/tested on demand.
 */
async function runDailyReportJob() {
  const date = todayISO();
  try {
    console.log(`[scheduler] Generating automatic daily report for ${date}…`);
    const result = await generateDailyReport(date);

    if (REPORT_EMAIL) {
      const sent = await sendMail({
        to: REPORT_EMAIL,
        subject: `Clinic Daily Report — ${date}`,
        text: result.report,
        html: `<h2>Daily Clinic Report — ${date}</h2><p>${String(result.report).replace(
          /\n/g,
          '<br>'
        )}</p><p style="color:#888;font-size:12px">${result.total_patients} patient(s) seen.</p>`
      });
      console.log(
        sent
          ? `[scheduler] Daily report emailed to ${REPORT_EMAIL}.`
          : '[scheduler] Daily report generated and stored (email not configured).'
      );
    } else {
      console.log('[scheduler] Daily report generated and stored (no REPORT_EMAIL set).');
    }
    return result;
  } catch (err) {
    // Never let a scheduler failure crash the server.
    console.error('[scheduler] Daily report job failed:', err.message);
    return null;
  }
}

/**
 * Register the cron job. Called once at server startup.
 */
function startScheduler() {
  if (!cron.validate(REPORT_CRON)) {
    console.warn(`[scheduler] Invalid REPORT_CRON "${REPORT_CRON}" — automatic reports disabled.`);
    return;
  }
  cron.schedule(REPORT_CRON, runDailyReportJob);
  console.log(
    `[scheduler] Automatic daily report scheduled (cron: "${REPORT_CRON}"` +
      (REPORT_EMAIL && isConfigured() ? `, emailing ${REPORT_EMAIL}` : ', store-only') +
      ').'
  );
}

module.exports = { startScheduler, runDailyReportJob };
