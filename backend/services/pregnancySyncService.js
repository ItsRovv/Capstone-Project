const Pregnancy = require('../models/Pregnancy');
const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Patient = require('../models/Patient');

const TOTAL_TRIMESTER_COLS = 15;

/**
 * Build a tracking-form row from a pregnancy record + patient data.
 */
function buildTrackingRow(preg, patient) {
  return {
    patient_id: preg.patient_id,
    name: patient ? `${patient.first_name} ${patient.last_name}` : '',
    address: patient?.address || '',
    age: patient?.age || null,
    cpNumber: patient?.contact_number || '',
    docSubmitted: false,
    edd: preg.edd || '',
    obIndex: preg.gp || '',
    trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
    deliveryDate: '',
    status: preg.status || 'Ongoing',
    lmp: preg.lmp || '',
    weeks: preg.weeks || '',
    trimesterLabel: preg.trimester || ''
  };
}

/**
 * One-way sync: upsert a patient's pregnancy data into the monthly
 * tracking form for the current month.
 *
 * Called after a pregnancy record is created or updated.
 */
async function syncPregnancyToTracking(preg) {
  if (!preg || !preg.patient_id) return;

  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const patient = await Patient.findById(preg.patient_id);
  const newRow = buildTrackingRow(preg, patient);

  let form = await PregnancyTrackingForm.findByMonthYear(monthYear);
  let rows = [];

  if (form && form.rows) {
    rows = Array.isArray(form.rows) ? form.rows : JSON.parse(form.rows);
    const idx = rows.findIndex((r) => r.patient_id === preg.patient_id);
    if (idx >= 0) {
      // Preserve manually-edited trimester data and docSubmitted flag
      const existing = rows[idx];
      newRow.trimester = existing.trimester || newRow.trimester;
      newRow.docSubmitted = existing.docSubmitted ?? false;
      newRow.deliveryDate = existing.deliveryDate || '';
      rows[idx] = newRow;
    } else {
      rows.push(newRow);
    }
    await PregnancyTrackingForm.update(monthYear, rows);
  } else {
    rows.push(newRow);
    await PregnancyTrackingForm.create(monthYear, rows);
  }
}

module.exports = { syncPregnancyToTracking, buildTrackingRow };
