const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const { generateDailyReport, generateWeeklyReport } = require('../services/reportService');
const { runDailyReportJob } = require('../utils/scheduler');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { aiLimiter, reportGenLimiter } = require('../middleware/rateLimit');

/**
 * Return a friendly error message for common AI provider failures.
 */
function aiErrorMessage(err) {
  const msg = err.message || '';
  if (err.status === 429 || msg.includes('429')) {
    if (msg.includes('quota') || msg.includes('exceeded your current quota')) {
      return 'AI API quota exceeded. Check your billing/plan or wait for the daily free-tier reset.';
    }
    return 'AI service is rate-limiting requests. Please wait a moment and try again.';
  }
  if (err.status === 400 && msg.includes('API key not valid')) {
    return 'AI API key is invalid or not activated. Check your key in the provider console.';
  }
  if (msg.includes('credit balance is too low') || msg.includes('purchase credits')) {
    return 'Anthropic API has no credits. Go to https://console.anthropic.com/billing to add a payment method or buy credits.';
  }
  return 'Failed to generate report. Please try again later.';
}

// AI summarization endpoint — all authenticated users (staff need to summarise notes)
// Rate-limited: 30 AI calls per IP per 15 min (aiLimiter)
router.post('/summarize-note', auth, aiLimiter, async (req, res) => {
  try {
    const { rawNote } = req.body;
    if (!rawNote) {
      return res.status(400).json({ message: 'Raw note is required' });
    }

    // Use AI service to summarize
    const structured = await aiService.summarizeNote(rawNote);

    res.json({ success: true, structured });
  } catch (err) {
    console.error('[AI] summarize-note error:', err.message);
    res.status(500).json({ message: aiErrorMessage(err) });
  }
});

// AI report generation endpoint (daily or weekly) — admin/doctor only
// Double-gated: aiLimiter (30/15 min) + reportGenLimiter (5/hour) to conserve tokens
router.post('/generate-report', auth, requireRole('admin', 'doctor'), aiLimiter, reportGenLimiter, async (req, res) => {
  try {
    const { date, type } = req.body; // type: 'daily' (default) | 'weekly'; date: YYYY-MM-DD
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const result =
      type === 'weekly' ? await generateWeeklyReport(date) : await generateDailyReport(date);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[AI] generate-report error:', err.message);
    res.status(500).json({ message: aiErrorMessage(err) });
  }
});

// Manually trigger the automatic end-of-day report job — admin/doctor only
// Same double gate as generate-report since it is also a full AI call
router.post('/run-daily-report', auth, requireRole('admin', 'doctor'), aiLimiter, reportGenLimiter, async (req, res) => {
  try {
    const result = await runDailyReportJob();
    if (!result) {
      return res.status(500).json({ message: 'Daily report job failed' });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[AI] run-daily-report error:', err.message);
    res.status(500).json({ message: aiErrorMessage(err) });
  }
});

module.exports = router;
