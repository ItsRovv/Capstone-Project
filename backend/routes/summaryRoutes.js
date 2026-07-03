const express = require('express');
const router = express.Router();
const summaryService = require('../services/summaryService');
const { generateDailyReport, generateWeeklyReport } = require('../services/reportService');
const { runDailyReportJob } = require('../utils/scheduler');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { summaryLimiter, reportGenLimiter } = require('../middleware/rateLimit');

// Summary tooling is clinic-internal — patients are not allowed.
router.use(auth, requireStaff);

/**
 * Return a friendly error message for common failures.
 */
function summaryErrorMessage(err) {
  const msg = err.message || '';
  if (err.status === 429 || msg.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  return 'Failed to generate report. Please try again later.';
}

// Note summarization endpoint — all authenticated staff
router.post('/summarize-note', auth, summaryLimiter, async (req, res) => {
  try {
    const { rawNote } = req.body;
    if (!rawNote) {
      return res.status(400).json({ message: 'Raw note is required' });
    }

    const structured = await summaryService.summarizeNote(rawNote);

    res.json({ success: true, structured });
  } catch (err) {
    console.error('[summary] summarize-note error:', err.message);
    res.status(500).json({ message: summaryErrorMessage(err) });
  }
});

// Report generation endpoint (daily or weekly) — admin/doctor only
router.post('/generate-report', auth, requireRole('admin', 'doctor'), summaryLimiter, reportGenLimiter, async (req, res) => {
  try {
    const { date, type } = req.body;
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const result =
      type === 'weekly' ? await generateWeeklyReport(date) : await generateDailyReport(date);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[summary] generate-report error:', err.message);
    res.status(500).json({ message: summaryErrorMessage(err) });
  }
});

// Manually trigger the automatic end-of-day report job — admin/doctor only
router.post('/run-daily-report', auth, requireRole('admin', 'doctor'), summaryLimiter, reportGenLimiter, async (req, res) => {
  try {
    const result = await runDailyReportJob();
    if (!result) {
      return res.status(500).json({ message: 'Daily report job failed' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[summary] run-daily-report error:', err.message);
    res.status(500).json({ message: summaryErrorMessage(err) });
  }
});

module.exports = router;
