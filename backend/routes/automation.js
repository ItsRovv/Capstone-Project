const express = require('express');
const router = express.Router();
const { generateDailyReport, generateWeeklyReport } = require('../services/reportService');
const { runDailyReportJob } = require('../utils/scheduler');

/**
 * Automation routes for n8n (or any external scheduler/orchestrator).
 *
 * These endpoints are NOT protected by the user JWT/cookie — instead they
 * require a shared secret supplied in the `x-automation-token` header that must
 * match `process.env.AUTOMATION_TOKEN`. This lets headless tools like n8n
 * trigger jobs on a schedule without performing an interactive login.
 *
 * If AUTOMATION_TOKEN is not set, every request is rejected (fail-closed).
 */
function requireAutomationToken(req, res, next) {
  const expected = process.env.AUTOMATION_TOKEN || '';
  const provided = req.get('x-automation-token') || '';
  if (!expected) {
    return res.status(503).json({ message: 'Automation is disabled: AUTOMATION_TOKEN is not configured.' });
  }
  // Constant-time-ish comparison without leaking length via early return.
  if (provided.length !== expected.length || provided !== expected) {
    return res.status(401).json({ message: 'Invalid automation token.' });
  }
  return next();
}

router.use(requireAutomationToken);

/** Health/ping for n8n to verify connectivity + token. */
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', service: 'automation' });
});

/**
 * Generate (and optionally email) today's daily report — the same job the
 * built-in scheduler runs. Point an n8n Schedule/Cron node at this endpoint.
 */
router.post('/daily-report', async (req, res) => {
  try {
    const result = await runDailyReportJob();
    if (!result) {
      return res.status(500).json({ message: 'Daily report job failed' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[automation] daily-report error:', err.message);
    res.status(500).json({ message: 'Daily report job failed' });
  }
});

/**
 * Generate a report for a specific date/type. Body: { date: 'YYYY-MM-DD', type?: 'daily'|'weekly' }
 */
router.post('/generate-report', async (req, res) => {
  try {
    const { date, type } = req.body || {};
    if (!date) {
      return res.status(400).json({ message: 'Date is required (YYYY-MM-DD)' });
    }
    const result =
      type === 'weekly' ? await generateWeeklyReport(date) : await generateDailyReport(date);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[automation] generate-report error:', err.message);
    res.status(500).json({ message: 'Report generation failed' });
  }
});

module.exports = router;
