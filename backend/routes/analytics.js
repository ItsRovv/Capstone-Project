const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireStaff } = require('../middleware/role');
const { routeError } = require('../utils/routeError');
const ollama = require('../services/ollamaService');

// Analytics are clinic-internal — patients are not allowed.
router.use(auth, requireStaff);

/**
 * GET /api/v1/analytics/overview
 * Returns aggregated analytics data for the dashboard charts.
 * Query params:
 *   - days: number of days to look back (default: 30)
 */
router.get('/overview', auth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    const startDateISO = startDate.toISOString().split('T')[0];
    const todayISO = today.toISOString().split('T')[0];

    // ── Summary counts ──
    const [patientCount] = await db.query('SELECT COUNT(*) AS total FROM patients');
    const totalPatients = parseInt(patientCount[0]?.total) || 0;

    const [consultCount] = await db.query(
      `SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date BETWEEN ? AND ?`,
      [startDateISO, todayISO]
    );
    const totalConsultations = parseInt(consultCount[0]?.total) || 0;

    const [todayConsultCount] = await db.query(
      `SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date = ?`,
      [todayISO]
    );
    const todayConsultations = parseInt(todayConsultCount[0]?.total) || 0;

    const [activePregnancies] = await db.query(
      `SELECT COUNT(*) AS total FROM pregnancies WHERE status = 'Ongoing'`
    );
    const activePregnancyCount = parseInt(activePregnancies[0]?.total) || 0;

    // ── Daily consultation volume (for bar/line chart) ──
    const [dailyVolume] = await db.query(
      `SELECT visit_date::date AS date, COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
       GROUP BY visit_date::date
       ORDER BY visit_date::date ASC`,
      [startDateISO, todayISO]
    );

    // ── Visit type breakdown (for donut chart) ──
    // Derive visit type from chief_complaint field since there's no explicit visit_type column
    const [visitTypes] = await db.query(
      `SELECT
         CASE
           WHEN chief_complaint ILIKE '%prenatal%' OR chief_complaint ILIKE '%checkup%' OR chief_complaint ILIKE '%pregnancy%' THEN 'Prenatal'
           WHEN chief_complaint ILIKE '%postnatal%' OR chief_complaint ILIKE '%postpartum%' THEN 'Postnatal'
           WHEN chief_complaint ILIKE '%delivery%' OR chief_complaint ILIKE '%labor%' THEN 'Delivery'
           WHEN chief_complaint ILIKE '%family planning%' OR chief_complaint ILIKE '%contracept%' THEN 'Family Planning'
           WHEN chief_complaint ILIKE '%emergency%' OR chief_complaint ILIKE '%urgent%' THEN 'Emergency'
           ELSE 'General Consultation'
         END AS visit_type,
         COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
       GROUP BY visit_type
       ORDER BY count DESC`,
      [startDateISO, todayISO]
    );

    // ── Top complaints (for bar chart) ──
    const [topComplaints] = await db.query(
      `SELECT chief_complaint, COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND chief_complaint IS NOT NULL AND chief_complaint != ''
       GROUP BY chief_complaint
       ORDER BY count DESC
       LIMIT 5`,
      [startDateISO, todayISO]
    );

    // ── Top diagnoses (for bar chart) ──
    const [topDiagnoses] = await db.query(
      `SELECT diagnosis, COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND diagnosis IS NOT NULL AND diagnosis != ''
       GROUP BY diagnosis
       ORDER BY count DESC
       LIMIT 5`,
      [startDateISO, todayISO]
    );

    // ── Pregnancy status breakdown ──
    const [pregnancyStatus] = await db.query(
      `SELECT status, COUNT(*) AS count
       FROM pregnancies
       GROUP BY status
       ORDER BY count DESC`
    );

    // ── Deliveries this month ──
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const [deliveries] = await db.query(
      `SELECT COUNT(*) AS total FROM pregnancies
       WHERE status = 'Completed'
         AND updated_at::date >= ?`,
      [monthStart]
    );
    const deliveriesThisMonth = parseInt(deliveries[0]?.total) || 0;

    // ── New vs returning patients (this period) ──
    const [newPatients] = await db.query(
      `SELECT COUNT(DISTINCT patient_id) AS total
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND patient_id NOT IN (
           SELECT DISTINCT patient_id FROM consultations WHERE visit_date::date < ?
         )`,
      [startDateISO, todayISO, startDateISO]
    );
    const newPatientCount = parseInt(newPatients[0]?.total) || 0;
    const returningPatientCount = totalConsultations - newPatientCount;

    // ── Trend: compare this period to previous period ──
    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevStartISO = prevStartDate.toISOString().split('T')[0];
    const prevEndISO = prevEndDate.toISOString().split('T')[0];

    const [prevConsultCount] = await db.query(
      `SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date BETWEEN ? AND ?`,
      [prevStartISO, prevEndISO]
    );
    const prevTotal = parseInt(prevConsultCount[0]?.total) || 0;
    const trendChange = prevTotal === 0
      ? (totalConsultations > 0 ? 100 : 0)
      : Math.round(((totalConsultations - prevTotal) / prevTotal) * 100);

    res.json({
      success: true,
      period: { days, start: startDateISO, end: todayISO },
      summary: {
        totalPatients,
        totalConsultations,
        todayConsultations,
        activePregnancies: activePregnancyCount,
        deliveriesThisMonth,
        newPatients: newPatientCount,
        returningPatients: returningPatientCount
      },
      charts: {
        dailyVolume: dailyVolume.map((r) => ({ date: r.date, count: parseInt(r.count) })),
        visitTypes: visitTypes.map((r) => ({ name: r.visit_type, value: parseInt(r.count) })),
        topComplaints: topComplaints.map((r) => ({ name: r.chief_complaint, count: parseInt(r.count) })),
        topDiagnoses: topDiagnoses.map((r) => ({ name: r.diagnosis, count: parseInt(r.count) })),
        pregnancyStatus: pregnancyStatus.map((r) => ({ name: r.status, value: parseInt(r.count) }))
      },
      trend: { change: trendChange, current: totalConsultations, previous: prevTotal }
    });
  } catch (err) {
    routeError(res, err);
  }
});

/**
 * GET /api/v1/analytics/ai-insight
 * Returns an AI-generated narrative insight based on current analytics data.
 * Uses Ollama local LLM if available, otherwise returns a rule-based insight.
 */
router.get('/ai-insight', auth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    const startDateISO = startDate.toISOString().split('T')[0];
    const todayISO = today.toISOString().split('T')[0];

    // Gather key metrics for the AI
    const [consultCount] = await db.query(
      `SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date BETWEEN ? AND ?`,
      [startDateISO, todayISO]
    );
    const totalConsultations = parseInt(consultCount[0]?.total) || 0;

    const [patientCount] = await db.query('SELECT COUNT(*) AS total FROM patients');
    const totalPatients = parseInt(patientCount[0]?.total) || 0;

    const [activePreg] = await db.query(`SELECT COUNT(*) AS total FROM pregnancies WHERE status = 'Ongoing'`);
    const activePregnancies = parseInt(activePreg[0]?.total) || 0;

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const [deliv] = await db.query(
      `SELECT COUNT(*) AS total FROM pregnancies WHERE status = 'Completed' AND updated_at::date >= ?`,
      [monthStart]
    );
    const deliveriesThisMonth = parseInt(deliv[0]?.total) || 0;

    const [topComplaints] = await db.query(
      `SELECT chief_complaint, COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND chief_complaint IS NOT NULL AND chief_complaint != ''
       GROUP BY chief_complaint
       ORDER BY count DESC
       LIMIT 3`,
      [startDateISO, todayISO]
    );

    const [topDiagnoses] = await db.query(
      `SELECT diagnosis, COUNT(*) AS count
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND diagnosis IS NOT NULL AND diagnosis != ''
       GROUP BY diagnosis
       ORDER BY count DESC
       LIMIT 3`,
      [startDateISO, todayISO]
    );

    const [newPats] = await db.query(
      `SELECT COUNT(DISTINCT patient_id) AS total
       FROM consultations
       WHERE visit_date::date BETWEEN ? AND ?
         AND patient_id NOT IN (
           SELECT DISTINCT patient_id FROM consultations WHERE visit_date::date < ?
         )`,
      [startDateISO, todayISO, startDateISO]
    );
    const newPatients = parseInt(newPats[0]?.total) || 0;
    const returningPatients = totalConsultations - newPatients;

    // Previous period for trend
    const prevEndDate = new Date(startDate);
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevStartISO = prevStartDate.toISOString().split('T')[0];
    const prevEndISO = prevEndDate.toISOString().split('T')[0];

    const [prevCount] = await db.query(
      `SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date BETWEEN ? AND ?`,
      [prevStartISO, prevEndISO]
    );
    const prevTotal = parseInt(prevCount[0]?.total) || 0;
    const trendChange = prevTotal === 0
      ? (totalConsultations > 0 ? 100 : 0)
      : Math.round(((totalConsultations - prevTotal) / prevTotal) * 100);

    const analyticsData = {
      totalConsultations,
      totalPatients,
      newPatients,
      returningPatients,
      topComplaints: topComplaints.map((r) => [r.chief_complaint, parseInt(r.count)]),
      topDiagnoses: topDiagnoses.map((r) => [r.diagnosis, parseInt(r.count)]),
      activePregnancies,
      deliveriesThisMonth,
      trend: { change: trendChange }
    };

    // Try Ollama first, fall back to a simple rule-based insight
    try {
      const insight = await ollama.generateInsight(analyticsData);
      res.json({ success: true, insight, source: 'ollama' });
    } catch {
      // Fallback: generate a simple rule-based insight
      let insight = '';
      if (totalConsultations === 0) {
        insight = `No consultations were recorded in the last ${days} days. Consider encouraging patients to schedule visits.`;
      } else {
        const trendText = trendChange > 0 ? `up ${trendChange}%` : trendChange < 0 ? `down ${Math.abs(trendChange)}%` : 'stable';
        insight = `Clinic activity shows ${totalConsultations} consultations over the last ${days} days (${trendText} vs the previous period). `;
        if (topComplaints.length > 0) {
          insight += `The most common complaint is "${topComplaints[0].chief_complaint}" (${topComplaints[0].count} cases). `;
        }
        if (activePregnancies > 0) {
          insight += `There are ${activePregnancies} active pregnancies being tracked`;
          if (deliveriesThisMonth > 0) {
            insight += ` with ${deliveriesThisMonth} completed deliveries this month`;
          }
          insight += '. ';
        }
        insight += 'Continue monitoring high-risk cases and ensuring timely follow-ups.';
      }
      res.json({ success: true, insight, source: 'fallback' });
    }
  } catch (err) {
    routeError(res, err);
  }
});

/**
 * GET /api/v1/analytics/ollama-status
 * Returns the health status of the Ollama local LLM service.
 */
router.get('/ollama-status', auth, async (req, res) => {
  try {
    const status = await ollama.checkHealth();
    res.json({ success: true, ...status });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
