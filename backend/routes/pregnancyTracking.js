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

// "20 weeks" / "20" → 20; anything else → null.
function parseWeeks(v) {
  const n = parseInt(String(v || '').trim(), 10);
  return Number.isFinite(n) && n >= 0 && n <= 45 ? n : null;
}

// The clinic is in the Philippines — always bucket visits by Manila time, not
// the server's timezone, or late-night saves land on the wrong month/row.
const CLINIC_TZ = 'Asia/Manila';
const monthKey = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: CLINIC_TZ });
const mmddOf = (d) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', timeZone: CLINIC_TZ });

// Upsert the patient's row in the month form and stamp the visit's MM/DD into
// the trimester column for the given month of pregnancy.
async function writeTrackingRow(patient, pregnancy, when, monthOfPregnancy) {
  const pid = Number(patient.id ?? patient.patient_id);
  const monthYear = monthKey(when);
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
      edd: pregnancy?.edd || '',
      obIndex: pregnancy?.gp || pregnancy?.ob_index || '',
      trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
      deliveryDate: ''
    };
    rows.push(row);
  }
  const col = trimesterCol(row, monthOfPregnancy);
  if (col !== null && col !== undefined) row.trimester[col] = mmddOf(when);
  if (pregnancy?.edd) row.edd = pregnancy.edd;
  if (pregnancy?.gp || pregnancy?.ob_index) row.obIndex = pregnancy.gp || pregnancy.ob_index;

  if (form) await PregnancyTrackingForm.update(monthYear, rows);
  else await PregnancyTrackingForm.create(monthYear, rows);
  return { monthYear, column: col, date: mmddOf(when) };
}

// A prenatal consultation writes itself into the patient's tracking row for the
// month the visit happened — details plus the visit date in the right trimester col.
// If the patient has no active pregnancy yet (e.g. baseline was skipped), one is
// created so the visit still lands on the tracking form.
async function recordPrenatalVisit(patientId, visitDate, trimester, prenatalData) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const [patient, pregnancies] = await Promise.all([Patient.findById(pid), Pregnancy.findByPatientId(pid)]);
  if (!patient) return false;

  const when = visitDate ? new Date(visitDate) : new Date();
  if (Number.isNaN(when.getTime())) return false;

  let active = (pregnancies || []).find(isActivePregnancy);
  if (!active) {
    const id = await Pregnancy.create(pid, {
      status: 'Ongoing',
      first_visit_date: when.toISOString().slice(0, 10),
      weeks: parseWeeks(prenatalData?.aog_lmp) ?? parseWeeks(prenatalData?.aog_utz),
      trimester: ['1', '2', '3'].includes(String(trimester)) ? String(trimester) : null,
      notes: 'Added automatically: prenatal consultation recorded without a pregnancy record.'
    });
    active = { id, patient_id: pid, status: 'Ongoing' };
  }
  // Derive the month of pregnancy at the visit: prefer stored weeks, else
  // compute from LMP — many pregnancies only have LMP recorded.
  let monthOfPregnancy = 9;
  const weeksAtVisit = active.weeks
    ? Number(active.weeks)
    : active.lmp
      ? Math.max(0, Math.floor((when.getTime() - new Date(active.lmp).getTime()) / (7 * 24 * 3600000)))
      : null;
  if (Number.isFinite(weeksAtVisit)) {
    monthOfPregnancy = Math.min(10, Math.max(1, Math.ceil(weeksAtVisit / 4.345)));
  } else {
    // No LMP/weeks recorded — use the trimester the staff selected at queue
    // (1st→month 2, 2nd→month 5, 3rd→month 9) as a reasonable estimate.
    monthOfPregnancy = { '1': 2, '2': 5, '3': 9 }[String(trimester)] || 9;
  }

  return writeTrackingRow(patient, active, when, monthOfPregnancy);
}

// A postnatal consultation stamps the visit date into the postpartum ("+")
// columns of the patient's tracking row — month 10 routes to those columns.
async function recordPostnatalVisit(patientId, visitDate) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const [patient, pregnancies] = await Promise.all([Patient.findById(pid), Pregnancy.findByPatientId(pid)]);
  if (!patient) return false;

  const when = visitDate ? new Date(visitDate) : new Date();
  if (Number.isNaN(when.getTime())) return false;

  // Most recent pregnancy regardless of status — it's usually 'Completed' by
  // now, which is fine; the row only borrows its EDD/OB index. If the patient
  // somehow has none, record a completed one so tracking stays consistent.
  let latest = (pregnancies || [])[0] || null;
  if (!latest) {
    const id = await Pregnancy.create(pid, {
      status: 'Completed',
      first_visit_date: when.toISOString().slice(0, 10),
      notes: 'Added automatically: postnatal consultation recorded without a pregnancy record.'
    });
    latest = { id, patient_id: pid, status: 'Completed' };
  }

  return writeTrackingRow(patient, latest, when, 10);
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
module.exports.recordPrenatalVisit = recordPrenatalVisit;
module.exports.recordPostnatalVisit = recordPostnatalVisit;
