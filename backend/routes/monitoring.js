const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { decryptObject } = require('../utils/encryption');
const { routeError } = require('../utils/routeError');
const Admission = require('../models/Admission');

router.use(auth, requireStaff);

// Contact numbers are stored encrypted; names are not.
const readable = (row) => decryptObject(row, ['contact_number'], { deterministic: ['contact_number'] });
const days = (value, fallback) => Math.min(Math.max(parseInt(value, 10) || fallback, 1), 365);

// Patients expected to give birth at JLMC soon or overdue (replaces the clinic's
// Google Sheet). "Delivering at JLMC" mirrors the tracking form flag: the latest
// consultation's delivery location is JLMC, or there are no consultations yet.
// EDD is 40 weeks, so "overdue" starts at 41 weeks (EDD + 7 days).
// Read-only: nothing here edits clinical data.
router.get('/expected-deliveries', async (req, res) => {
  try {
    const window = days(req.query.days, 30);
    const [rows] = await db.execute(
      `SELECT p.id AS pregnancy_id, pa.id AS patient_id, pa.first_name, pa.last_name, pa.contact_number,
              p.edd, p.weeks, p.trimester, p.gp,
              (SELECT MAX(c.visit_date) FROM consultations c WHERE c.patient_id = pa.id) AS last_consultation,
              (SELECT MIN(c.visit_date) FROM consultations c WHERE c.patient_id = pa.id) AS first_consultation,
              (SELECT c.delivery_location FROM consultations c WHERE c.patient_id = pa.id AND c.delivery_location IS NOT NULL
                 ORDER BY c.visit_date DESC LIMIT 1) AS delivery_location,
              (CURRENT_DATE >= p.edd::date + 7) AS overdue
       FROM pregnancies p JOIN patients pa ON pa.id = p.patient_id
       WHERE p.status = 'Ongoing' AND p.edd IS NOT NULL AND p.edd <= CURRENT_DATE + (?::int * INTERVAL '1 day')
         AND (
           NOT EXISTS (SELECT 1 FROM consultations c WHERE c.patient_id = pa.id)
           OR (SELECT UPPER(c.delivery_location) FROM consultations c
                WHERE c.patient_id = pa.id ORDER BY c.visit_date DESC LIMIT 1) = 'JLMC'
         )
       ORDER BY p.edd ASC LIMIT 500`,
      [window]
    );
    res.json({ days: window, rows: rows.map(readable) });
  } catch (err) { routeError(res, err); }
});

// Postpartum follow-ups from Admission and Discharge that are overdue: the due
// date has passed and they have not been marked done. The window bounds how far
// back to look for a missed due date.
router.get('/missed-followups', async (req, res) => {
  try {
    const window = days(req.query.days, 30);
    const [rows] = await db.execute(
      `SELECT f.id AS followup_id, f.due_at, a.id AS admission_id, (f.missed_at IS NOT NULL) AS marked_missed,
              pa.id AS patient_id, pa.first_name, pa.last_name, pa.contact_number,
              GREATEST(0, (CURRENT_DATE - f.due_at::date)) AS days_overdue
       FROM postpartum_followups f
       JOIN admissions a ON a.id = f.admission_id
       JOIN patients pa ON pa.id = a.patient_id
       WHERE f.done_at IS NULL AND f.due_at <= NOW()
         AND f.due_at >= NOW() - (?::int * INTERVAL '1 day')
       ORDER BY f.due_at ASC LIMIT 500`,
      [window]
    );
    res.json({ days: window, rows: rows.map(readable) });
  } catch (err) { routeError(res, err); }
});

// Administrator-only charting activity: shows every midwife note, who wrote it,
// when, and which patient/admission it belongs to.
router.get('/charting-activity', requireRole('admin'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const rows = await Admission.chartingActivity({ from, to });
    res.json({ from, to, rows });
  } catch (err) { routeError(res, err); }
});

module.exports = router;
