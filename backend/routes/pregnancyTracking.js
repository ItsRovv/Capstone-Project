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

// Which trimester column a visit belongs in, from the month of pregnancy
// (1-7 = one col each, month 8 = 2 cols, month 9 = 4 cols, postpartum = 2 cols).
function trimesterCol(row, monthOfPregnancy) {
  const t = row.trimester || [];
  const pick = (cols) => cols.find((c) => !String(t[c] || '').trim());
  if (monthOfPregnancy <= 7) return String(t[monthOfPregnancy - 1] || '').trim() ? null : monthOfPregnancy - 1;
  if (monthOfPregnancy === 8) return pick([7, 8]);
  if (monthOfPregnancy === 9) return pick([9, 10, 11, 12]);
  return pick([13, 14]);
}

// A prenatal consultation writes itself into the patient's tracking row for the
// month the visit happened — details plus the visit date in the right trimester col.
async function recordPrenatalVisit(patientId, visitDate) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const [patient, pregnancies] = await Promise.all([Patient.findById(pid), Pregnancy.findByPatientId(pid)]);
  const active = (pregnancies || []).find(isActivePregnancy);
  if (!patient || !active) return false;

  const when = visitDate ? new Date(visitDate) : new Date();
  if (Number.isNaN(when.getTime())) return false;
  const monthYear = when.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const mmdd = `${String(when.getMonth() + 1).padStart(2, '0')}/${String(when.getDate()).padStart(2, '0')}`;
  // Derive the month of pregnancy at the visit: prefer stored weeks, else
  // compute from LMP — many pregnancies only have LMP recorded.
  let monthOfPregnancy = 9;
  const weeksAtVisit = active.weeks
    ? Number(active.weeks)
    : active.lmp
      ? Math.max(0, Math.floor((when.getTime() - new Date(active.lmp).getTime()) / (7 * 24 * 3600000)))
      : null;
  if (Number.isFinite(weeksAtVisit)) monthOfPregnancy = Math.min(10, Math.max(1, Math.ceil(weeksAtVisit / 4.345)));

  const form = await PregnancyTrackingForm.findByMonthYear(monthYear);
  const rows = form ? (typeof form.rows === 'string' ? JSON.parse(form.rows) : form.rows || []) : [];
  let row = rows.find((r) => Number(r?.patient_id) === pid);
  if (!row) {
    row = {
      patient_id: pid,
      name: `${patient.first_name} ${patient.last_name}`,
      address: patient.address || '',
      age: patient.age ?? '',
      cpNumber: patient.contact_number || '',
      docSubmitted: false,
      edd: active.edd || '',
      obIndex: active.gp || active.ob_index || '',
      trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
      deliveryDate: ''
    };
    rows.push(row);
  }
  const col = trimesterCol(row, monthOfPregnancy);
  if (col !== null && col !== undefined) row.trimester[col] = mmdd;
  if (active.edd) row.edd = active.edd;
  if (active.gp || active.ob_index) row.obIndex = active.gp || active.ob_index;

  if (form) await PregnancyTrackingForm.update(monthYear, rows);
  else await PregnancyTrackingForm.create(monthYear, rows);
  return true;
}

// Get active pregnancies pre-filled for the tracking form. isOld marks patients
// with earlier records; deliveryInJlmc marks those set to deliver (or delivered) here.
router.get('/active-pregnancies', async (req, res) => {
  try {
    const pregnancies = await Pregnancy.findActive();
    const Consultation = require('../models/Consultation');
    const rows = await Promise.all(
      pregnancies.map(async (pr) => {
        const patient = await Patient.findById(pr.patient_id);
        const consults = await Consultation.findByPatientId(pr.patient_id).catch(() => []);
        const latest = (consults || [])[0] || null;
        const isOld = (consults || []).length > 1 || pregnancies.filter((p) => p.patient_id === pr.patient_id).length > 1;
        const deliveryInJlmc = ['JLMC', 'jlmc'].includes(String(latest?.delivery_location || '')) || latest === null;
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
          deliveryDate: '',
          isOld,
          deliveryInJlmc
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
// Attached after the router export so it isn't overwritten above.
module.exports.recordPrenatalVisit = recordPrenatalVisit;
