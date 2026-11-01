const express = require('express');
const router = express.Router();
const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Patient = require('../models/Patient');
const Pregnancy = require('../models/Pregnancy');
const AuditLog = require('../models/AuditLog');
const { requireStaff } = require('../middleware/role');
const auth = require('../middleware/auth');
const { routeError } = require('../utils/routeError');

router.use(auth, requireStaff);

const TOTAL_TRIMESTER_COLS = 15;

const INACTIVE_STATUSES = new Set(['delivered', 'discharged', 'completed']);
const isActivePregnancy = (p) => !INACTIVE_STATUSES.has(String(p.status || '').toLowerCase());

// The form keeps dates as free text (e.g. "10/15" or "Oct 15, 2026"); only what parses is written.
function parseDateLoose(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// LMP = EDD - 280 days (Naegele's rule). Used only to fill an empty LMP.
function lmpFromEdd(eddIso) {
  const d = new Date(`${eddIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 280);
  return d.toISOString().slice(0, 10);
}

// EDD, OB index and delivery date belong on the pregnancy record too, so the
// patient profile, the admission record and this form always agree.
async function syncPregnancyRows(rows) {
  let count = 0;
  for (const r of rows || []) {
    const patientId = Number(r?.patient_id);
    if (!Number.isInteger(patientId) || patientId <= 0) continue;
    const pregnancies = await Pregnancy.findByPatientId(patientId);
    const active = (pregnancies || []).find(isActivePregnancy);
    if (!active) continue;
    const edd = parseDateLoose(r.edd);
    const delivered = parseDateLoose(r.deliveryDate);
    const obIndex = String(r.obIndex || '').trim() || null;
    const changed = await Pregnancy.updateTracking(active.id, {
      edd, obIndex,
      lmpIfMissing: edd ? lmpFromEdd(edd) : null,
      status: delivered ? 'delivered' : null
    });
    if (changed) count += 1;
  }
  return count;
}

// Get active pregnancies pre-filled for the tracking form.
router.get('/active-pregnancies', async (req, res) => {
  try {
    const pregnancies = await Pregnancy.findActive();
    const rows = await Promise.all(
      pregnancies.map(async (pr) => {
        const patient = await Patient.findById(pr.patient_id);
        return {
          patient_id: pr.patient_id,
          name: patient ? `${patient.first_name} ${patient.last_name}` : '',
          address: patient?.address || '',
          age: patient?.age || null,
          cpNumber: patient?.contact_number || '',
          docSubmitted: false,
          edd: pr.edd || '',
          obIndex: pr.gp || '',
          trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
          deliveryDate: ''
        };
      })
    );
    res.json(rows);
  } catch (err) {
    routeError(res, err);
  }
});

// Get saved form by month/year.
router.get('/:monthYear', async (req, res) => {
  try {
    const form = await PregnancyTrackingForm.findByMonthYear(req.params.monthYear);
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    res.json(form);
  } catch (err) {
    routeError(res, err);
  }
});

// Create or update a tracking form.
router.post('/', async (req, res) => {
  try {
    const { monthYear, rows } = req.body;
    if (!monthYear || !Array.isArray(rows)) {
      return res.status(400).json({ message: 'monthYear and rows are required' });
    }

    const synced = await syncPregnancyRows(rows);
    const existing = await PregnancyTrackingForm.findByMonthYear(monthYear);
    if (existing) {
      await PregnancyTrackingForm.update(monthYear, rows);
      await AuditLog.create({
        userId: req.user?.id,
        action: 'UPDATE',
        tableName: 'pregnancy_tracking_forms',
        recordId: existing.id,
        newData: { monthYear, rows },
        ipAddress: req.ip
      });
      return res.json({ message: 'Form updated', pregnancySynced: synced });
    }

    const id = await PregnancyTrackingForm.create(monthYear, rows);
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'pregnancy_tracking_forms',
      recordId: id,
      newData: { monthYear, rows },
      ipAddress: req.ip
    });
    res.status(201).json({ id, message: 'Form created', pregnancySynced: synced });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
