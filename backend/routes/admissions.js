const express = require('express');
const router = express.Router();
const Admission = require('../models/Admission');
const ClinicOption = require('../models/ClinicOption');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Pregnancy = require('../models/Pregnancy');
const ConsultationTransaction = require('../models/ConsultationTransaction');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const { requireStaff, requireClinical } = require('../middleware/role');
const {
  validateAdmission, validateAdmissionUpdate, validateDelivery, validateAdmissionItem,
  validateDischarge, validateReferral
} = require('../middleware/validation');
const svc = require('../services/admissionService');
const { onDelivered } = require('../services/admissionSync');
const { routeError } = require('../utils/routeError');

router.use(auth, requireStaff);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_FOLLOWUP = ['expired', 'transferred', 'absconded'];

function audit(req, action, recordId, oldData, newData, tableName = 'admissions') {
  return AuditLog.create({
    userId: req.user?.id, action, tableName, recordId, oldData, newData, ipAddress: req.ip
  }).catch((e) => console.warn('[audit] failed:', e.message));
}

const bad = (res, error) => res.status(400).json({ message: error.details?.[0]?.message || error.message });

// Loads :id into req.admission. Records of finished stays are locked for non-admins.
function loadAdmission({ allowLockedFor = [] } = {}) {
  return async (req, res, next) => {
    try {
      const admission = await Admission.findById(req.params.id);
      if (!admission) return res.status(404).json({ message: 'Admission not found' });
      const locked = !svc.isActiveStatus(admission.status);
      if (locked && req.method !== 'GET' && !allowLockedFor.includes('*') && req.user.role !== 'admin') {
        return res.status(403).json({
          message: 'This stay is already closed. Please ask the clinic administrator to make changes.'
        });
      }
      req.admission = admission;
      next();
    } catch (err) {
      routeError(res, err);
    }
  };
}

// ── Lists ─────────────────────────────────────────────────────────────────
router.get('/current', async (req, res) => {
  try {
    res.json(await Admission.listActive());
  } catch (err) { routeError(res, err); }
});

router.get('/logbook', async (req, res) => {
  try {
    const { month } = req.query;
    if (month && !MONTH_RE.test(month)) return res.status(400).json({ message: 'month must look like 2026-10' });
    res.json(await Admission.logbook({ month }));
  } catch (err) { routeError(res, err); }
});

router.get('/followups', async (req, res) => {
  try {
    const state = ['pending', 'done', 'all'].includes(req.query.state) ? req.query.state : 'pending';
    res.json(await Admission.listFollowups({ state }));
  } catch (err) { routeError(res, err); }
});

router.post('/followups/:id/done', requireClinical, async (req, res) => {
  try {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 1000) : null;
    const ok = await Admission.markFollowupDone(req.params.id, req.user.id, notes);
    if (!ok) return res.status(404).json({ message: 'Follow-up not found or already done' });
    await audit(req, 'UPDATE', Number(req.params.id), undefined, { done: true }, 'postpartum_followups');
    res.json({ message: 'Follow-up marked as done' });
  } catch (err) { routeError(res, err); }
});

router.get('/patient/:patientId', async (req, res) => {
  try {
    res.json(await Admission.list({ patientId: req.params.patientId }));
  } catch (err) { routeError(res, err); }
});

// Everything we already know about the patient, so staff do not retype it.
router.get('/prefill/:patientId', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const [consultations, pregnancies, active, settings] = await Promise.all([
      Consultation.findByPatientId(patient.id),
      Pregnancy.findByPatientId(patient.id),
      Admission.findActiveByPatient(patient.id),
      ClinicOption.getSettingsMap()
    ]);
    const latest = consultations[0] || null;
    const pregnancy = pregnancies.find((p) => p.status === 'Ongoing') || null;
    res.json({
      patient: {
        id: patient.id, first_name: patient.first_name, last_name: patient.last_name, age: patient.age,
        allergies: patient.allergies || null
      },
      latestConsultation: latest && {
        id: latest.id, visit_date: latest.visit_date, chief_complaint: latest.chief_complaint,
        diagnosis: latest.diagnosis, objective: latest.objective, delivery_location: latest.delivery_location
      },
      pregnancy: pregnancy && {
        id: pregnancy.id, lmp: pregnancy.lmp, edd: pregnancy.edd, gp: pregnancy.gp, weeks: pregnancy.weeks, trimester: pregnancy.trimester
      },
      activeAdmissionId: active?.id || null,
      requireConsent: settings.require_consent !== 'false'
    });
  } catch (err) { routeError(res, err); }
});

router.get('/', async (req, res) => {
  try {
    const { status, month, patient_id: patientId } = req.query;
    if (month && !MONTH_RE.test(month)) return res.status(400).json({ message: 'month must look like 2026-10' });
    res.json(await Admission.list({ status, month, patientId }));
  } catch (err) { routeError(res, err); }
});

// ── Admit ────────────────────────────────────────────────────────────────
router.post('/', requireClinical, async (req, res) => {
  try {
    const { error, value } = validateAdmission(req.body);
    if (error) return bad(res, error);
    const patient = await Patient.findById(value.patient_id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const existing = await Admission.findActiveByPatient(value.patient_id);
    if (existing) {
      return res.status(409).json({
        message: `${patient.first_name} ${patient.last_name} is already admitted. Open the current stay instead.`,
        admissionId: existing.id
      });
    }
    if (!value.pregnancy_id) {
      const pregnancies = await Pregnancy.findByPatientId(value.patient_id);
      value.pregnancy_id = pregnancies.find((p) => p.status === 'Ongoing')?.id ?? null;
    }
    const id = await Admission.create(value, req.user.id);
    await audit(req, 'CREATE', id, undefined, value);
    res.status(201).json({ id, message: 'Patient admitted' });
  } catch (err) { routeError(res, err); }
});

// ── One stay ────────────────────────────────────────────────────────────
router.get('/:id', loadAdmission(), async (req, res) => {
  try {
    const a = req.admission;
    const [delivery, items, discharge, followups, referral, settings] = await Promise.all([
      Admission.getDelivery(a.id), Admission.listItems(a.id), Admission.getDischarge(a.id),
      Admission.listFollowupsForAdmission(a.id), Admission.getReferral(a.id), ClinicOption.getSettingsMap()
    ]);
    const warnings = [];
    if (settings.require_consent !== 'false' && !a.consent_signed && svc.isActiveStatus(a.status)) {
      warnings.push({ code: 'NO_CONSENT', message: 'Informed consent has not been recorded yet.' });
    }
    const stay = delivery && svc.isActiveStatus(a.status)
      ? svc.checkMinStay(delivery.delivered_at, settings.min_stay_hours) : null;
    if (stay && !stay.ok) {
      warnings.push({
        code: 'MIN_STAY',
        message: `Only ${stay.hoursStayed} hour(s) since delivery. The usual minimum stay is ${stay.requiredHours} hours.`
      });
    }
    res.json({
      admission: a, delivery, items, itemsTotal: svc.itemsTotal(items), discharge, followups, referral,
      warnings, locked: !svc.isActiveStatus(a.status)
    });
  } catch (err) { routeError(res, err); }
});

router.put('/:id', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateAdmissionUpdate(req.body);
    if (error) return bad(res, error);
    await Admission.update(req.params.id, value);
    await audit(req, 'UPDATE', Number(req.params.id), req.admission, value);
    res.json({ message: 'Admission updated' });
  } catch (err) { routeError(res, err); }
});

router.post('/:id/status', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const next = req.body?.status;
    if (next !== 'in_labor') return res.status(400).json({ message: 'Only "in_labor" can be set here. Use the delivery, discharge or referral steps for the others.' });
    if (!svc.canTransition(req.admission.status, next)) {
      return res.status(409).json({ message: `A patient who is "${req.admission.status}" cannot be marked as in labor.` });
    }
    await Admission.setStatus(req.params.id, next);
    await audit(req, 'UPDATE', Number(req.params.id), { status: req.admission.status }, { status: next });
    res.json({ message: 'Marked as in labor' });
  } catch (err) { routeError(res, err); }
});

router.put('/:id/delivery', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateDelivery(req.body);
    if (error) return bad(res, error);
    const a = req.admission;
    if (!['admitted', 'in_labor', 'delivered'].includes(a.status) && req.user.role !== 'admin') {
      return res.status(409).json({ message: 'Delivery cannot be recorded for this stay.' });
    }
    const deliveryId = await Admission.saveDelivery(a.id, value);
    await audit(req, 'UPDATE', a.id, undefined, { delivery: value }, 'deliveries');
    onDelivered(a, { delivered_at: value.delivered_at }).catch((e) => console.warn('[admission] pregnancy sync failed:', e.message));
    res.json({ id: deliveryId, message: 'Delivery recorded' });
  } catch (err) { routeError(res, err); }
});

// ── Items used ──────────────────────────────────────────────────────────
// Allowed even after discharge: some items are only recorded afterwards.
router.post('/:id/items', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred to another facility. Ask the clinic administrator to add items.' });
    }
    const { error, value } = validateAdmissionItem(req.body);
    if (error) return bad(res, error);
    let { label, unit_price: unitPrice } = value;
    if (value.option_id) {
      const option = await ClinicOption.findById(value.option_id);
      if (!option || option.option_group !== 'item' || !option.active) {
        return res.status(400).json({ message: 'That item is not available. Please choose from the list.' });
      }
      label = option.label;
      if (unitPrice === undefined) unitPrice = option.price === null ? 0 : Number(option.price);
    }
    const id = await Admission.addItem(req.params.id, { ...value, label, unit_price: unitPrice ?? 0 }, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id), label, unit_price: unitPrice, quantity: value.quantity }, 'admission_items');
    res.status(201).json({ id, message: 'Item added' });
  } catch (err) { routeError(res, err); }
});

router.delete('/:id/items/:itemId', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred. Ask the clinic administrator to remove items.' });
    }
    const ok = await Admission.removeItem(req.params.id, req.params.itemId);
    if (!ok) return res.status(404).json({ message: 'Item not found' });
    await audit(req, 'DELETE', Number(req.params.itemId), { admission_id: Number(req.params.id) }, undefined, 'admission_items');
    res.json({ message: 'Item removed' });
  } catch (err) { routeError(res, err); }
});

// Turn the items used into a Consultation Transaction the front desk can collect.
router.post('/:id/transaction', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    const a = req.admission;
    const items = await Admission.listItems(a.id);
    if (!items.length && !a.philhealth_package) {
      return res.status(400).json({ message: 'Add at least one item used (or choose a PhilHealth package) first.' });
    }
    let packageOption = null;
    let packageAmount = 0;
    if (a.philhealth_package) {
      packageOption = await ClinicOption.findByGroupCode('package', a.philhealth_package);
      packageAmount = packageOption?.price === null || packageOption?.price === undefined ? 0 : Number(packageOption.price);
    }
    const payload = svc.buildTransactionPayload({ items, packageOption, packageAmount });

    const existing = (await ConsultationTransaction.findByAdmissionId(a.id))[0];
    let transactionId;
    if (existing) {
      await ConsultationTransaction.update(existing.id, {
        patient_id: a.patient_id, transaction_date: existing.transaction_date, recommendations: existing.recommendations, ...payload
      });
      transactionId = existing.id;
    } else {
      transactionId = await ConsultationTransaction.create({
        patient_id: a.patient_id, admission_id: a.id, created_by: req.user.id,
        recommendations: `Admission #${a.id}: items used during stay`, ...payload
      });
    }
    await audit(req, existing ? 'UPDATE' : 'CREATE', transactionId, undefined, { admission_id: a.id, ...payload }, 'consultation_transactions');
    res.status(existing ? 200 : 201).json({
      id: transactionId, updated: Boolean(existing), total_amount: payload.total_amount,
      message: existing ? 'Transaction updated with the latest items' : 'Transaction created for the front desk'
    });
  } catch (err) { routeError(res, err); }
});

// ── Discharge ────────────────────────────────────────────────────────────
router.post('/:id/discharge', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateDischarge(req.body);
    if (error) return bad(res, error);
    const a = req.admission;
    if (!svc.canTransition(a.status, 'discharged')) {
      return res.status(409).json({ message: 'This patient cannot be discharged yet. Record the delivery first, or refer the patient.' });
    }
    const reason = await ClinicOption.findByGroupCode('discharge_reason', value.disposition);
    if (!reason || !reason.active) {
      return res.status(400).json({ message: 'Please choose why the patient is going home from the list.' });
    }
    const [delivery, settings] = await Promise.all([Admission.getDelivery(a.id), ClinicOption.getSettingsMap()]);
    if (delivery && !value.override_reason) {
      const stay = svc.checkMinStay(delivery.delivered_at, settings.min_stay_hours);
      if (!stay.ok) {
        return res.status(409).json({
          code: 'MIN_STAY',
          message: `Only ${stay.hoursStayed} hour(s) since delivery. The usual minimum stay is ${stay.requiredHours} hours. Add a reason to discharge earlier.`
        });
      }
    }
    const dischargedAt = value.discharged_at ? new Date(value.discharged_at) : new Date();
    const followups = delivery && !NO_FOLLOWUP.includes(value.disposition)
      ? svc.followupDueDates(dischargedAt, svc.parseOffsets(settings.followup_offsets_hours)) : [];
    const id = await Admission.discharge(a.id, { ...value, discharged_at: dischargedAt }, req.user.id, followups);
    await audit(req, 'UPDATE', a.id, { status: a.status }, { status: 'discharged', disposition: value.disposition }, 'admissions');
    res.status(201).json({ id, followups: followups.length, message: 'Patient discharged' });
  } catch (err) { routeError(res, err); }
});

// ── Referral to another facility ─────────────────────────────────────────
router.post('/:id/referral', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateReferral(req.body);
    if (error) return bad(res, error);
    if (!svc.canTransition(req.admission.status, 'referred')) {
      return res.status(409).json({ message: 'This patient cannot be referred anymore because the baby is already delivered.' });
    }
    const id = await Admission.refer(req.params.id, value, req.user.id);
    await audit(req, 'UPDATE', Number(req.params.id), { status: req.admission.status }, { status: 'referred', facility: value.facility });
    res.status(201).json({ id, message: 'Patient referred' });
  } catch (err) { routeError(res, err); }
});

module.exports = router;
