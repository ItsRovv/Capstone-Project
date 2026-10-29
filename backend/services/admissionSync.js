const db = require('../config/db');
const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Pregnancy = require('../models/Pregnancy');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The tracking form screen stores each month under "October 2026".
function trackingKey(date) {
  const d = new Date(date);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Best-effort: callers must not fail an admission because syncing failed.
async function onDelivered(admission, delivery) {
  if (admission.pregnancy_id) {
    await db.execute(
      "UPDATE pregnancies SET status = 'Completed' WHERE id = ? AND status IS DISTINCT FROM 'Completed'",
      [admission.pregnancy_id]
    );
  }
  const key = trackingKey(delivery.delivered_at || new Date());
  const form = await PregnancyTrackingForm.findByMonthYear(key);
  if (!form || !form.rows) return;
  const rows = Array.isArray(form.rows) ? form.rows : JSON.parse(form.rows);
  const idx = rows.findIndex((r) => Number(r.patient_id) === Number(admission.patient_id));
  if (idx < 0) return;
  rows[idx] = { ...rows[idx], deliveryDate: new Date(delivery.delivered_at || Date.now()).toISOString().slice(0, 10), status: 'Completed' };
  await PregnancyTrackingForm.update(key, rows);
}

// "Plan to deliver at JLMC" ticked in a consultation: make sure the patient has an
// ongoing pregnancy record so she shows up in pregnancy tracking. Returns the new
// pregnancy id, or null when she already had one.
async function ensurePregnancyForJlmcDelivery(patientId) {
  const existing = await Pregnancy.findByPatientId(patientId);
  if (existing.some((p) => p.status === 'Ongoing')) return null;
  return Pregnancy.create(patientId, {
    status: 'Ongoing',
    first_visit_date: new Date().toISOString().slice(0, 10),
    notes: 'Added automatically: plans to deliver at JLMC (from consultation).'
  });
}

module.exports = { onDelivered, trackingKey, ensurePregnancyForJlmcDelivery };
