const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireStaff } = require('../middleware/role');
const { decryptObject } = require('../utils/encryption');
const { routeError } = require('../utils/routeError');

router.use(auth, requireStaff);

// Contact numbers are stored encrypted; names are not.
const readable = (row) => decryptObject(row, ['contact_number'], { deterministic: ['contact_number'] });
const days = (value, fallback) => Math.min(Math.max(parseInt(value, 10) || fallback, 1), 365);

// Patients expected to give birth soon or overdue (replaces the clinic's Google Sheet).
// EDD is 40 weeks, so "overdue" starts at 41 weeks (EDD + 7 days).
// Read-only: nothing here edits clinical data.
router.get('/expected-deliveries', async (req, res) => {
  try {
    const window = days(req.query.days, 30);
    const [rows] = await db.execute(
      `SELECT p.id AS pregnancy_id, pa.id AS patient_id, pa.first_name, pa.last_name, pa.contact_number,
              p.edd, p.weeks, p.trimester, p.gp,
              (SELECT MAX(c.visit_date) FROM consultations c WHERE c.patient_id = pa.id) AS last_consultation,
              (SELECT c.delivery_location FROM consultations c WHERE c.patient_id = pa.id AND c.delivery_location IS NOT NULL
                 ORDER BY c.visit_date DESC LIMIT 1) AS delivery_location,
              (CURRENT_DATE >= p.edd::date + 7) AS overdue
       FROM pregnancies p JOIN patients pa ON pa.id = p.patient_id
       WHERE p.status = 'Ongoing' AND p.edd IS NOT NULL AND p.edd <= CURRENT_DATE + (?::int * INTERVAL '1 day')
       ORDER BY p.edd ASC LIMIT 500`,
      [window]
    );
    res.json({ days: window, rows: rows.map(readable) });
  } catch (err) { routeError(res, err); }
});

// Patients with an ongoing pregnancy who have not been seen for N days.
router.get('/missed-followups', async (req, res) => {
  try {
    const window = days(req.query.days, 30);
    const [rows] = await db.execute(
      `SELECT pa.id AS patient_id, pa.first_name, pa.last_name, pa.contact_number, p.edd, p.weeks,
              MAX(c.visit_date) AS last_consultation
       FROM pregnancies p JOIN patients pa ON pa.id = p.patient_id
       LEFT JOIN consultations c ON c.patient_id = pa.id
       WHERE p.status = 'Ongoing'
       GROUP BY pa.id, pa.first_name, pa.last_name, pa.contact_number, p.edd, p.weeks
       HAVING MAX(c.visit_date) IS NULL OR MAX(c.visit_date) < NOW() - (?::int * INTERVAL '1 day')
       ORDER BY MAX(c.visit_date) ASC NULLS FIRST LIMIT 500`,
      [window]
    );
    res.json({ days: window, rows: rows.map(readable) });
  } catch (err) { routeError(res, err); }
});

module.exports = router;
