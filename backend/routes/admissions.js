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
const requireRole = require('../middleware/role');
const { requireAdmissionAccess, requireClinical } = require('../middleware/role');
const {
  validateAdmission, validateAdmissionUpdate, validateDelivery, validateAdmissionItem,
  validateDischarge, validateReferral, validatePackages, validateMidwifeNote, validateVitals, validateLaborEntry, validateChecklist
} = require('../middleware/validation');
const svc = require('../services/admissionService');
const { onDelivered } = require('../services/admissionSync');
const { routeError } = require('../utils/routeError');

router.use(auth, requireAdmissionAccess);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_FOLLOWUP = ['expired', 'transferred', 'absconded'];

function audit(req, action, recordId, oldData, newData, tableName = 'admissions') {
  return AuditLog.create({
    userId: req.user?.id, action, tableName, recordId, oldData, newData, ipAddress: req.ip
  }).catch((e) => console.warn('[audit] failed:', e.message));
}

const isFrontDesk = (req) => req.user?.role === 'staff';
const bad = (res, error) => res.status(400).json({ message: error.details?.[0]?.message || error.message });

const WARD_FIELDS = ['id', 'patient_id', 'first_name', 'last_name', 'age', 'status', 'admitted_at'];
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const priceOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// Which beds are taken by whom, so screens can show the ward at a glance.
// The reason for the stay is clinical, so front-desk staff do not get it.
async function wardInfo({ withComplaint = false } = {}) {
  const [settings, active] = await Promise.all([ClinicOption.getSettingsMap(), Admission.listActive()]);
  const totalBeds = Number(settings.ward_beds) || 3;
  const fields = withComplaint ? [...WARD_FIELDS, 'chief_complaint'] : WARD_FIELDS;
  const beds = Array.from({ length: totalBeds }, (_, i) => {
    const found = active.find((a) => a.bed_number === i + 1);
    return { number: i + 1, admission: found ? pick(found, fields) : null };
  });
  return {
    name: settings.ward_name || 'Ward',
    totalBeds,
    bedPrice: priceOrNull(settings.bed_price_per_night),
    freeBeds: beds.filter((b) => !b.admission).map((b) => b.number),
    beds,
    unassigned: active.filter((a) => !a.bed_number || a.bed_number > totalBeds).map((a) => pick(a, fields))
  };
}

// The packages chosen for a stay, with the clinic's wording and amount (hidden ones too,
// so an old stay still shows what it used).
async function resolvePackages(codes) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const options = await ClinicOption.list({ group: 'package', includeInactive: true });
  return codes
    .map((code) => options.find((o) => o.code === code))
    .filter(Boolean)
    .map((o) => ({ code: o.code, label: o.label, amount: o.price === null || o.price === undefined ? 0 : Number(o.price) }));
}

// Charge for the bed so far (or for the whole stay once it has ended).
function stayBed(admission, discharge, referral) {
  const end = discharge?.discharged_at || referral?.referred_at || new Date();
  return svc.bedCharge({
    bedNumber: admission.bed_number, pricePerNight: admission.bed_price, start: admission.admitted_at, end
  });
}

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
    const rows = await Admission.listActive();
    res.json(isFrontDesk(req) ? rows.map(svc.redactAdmission) : rows);
  } catch (err) { routeError(res, err); }
});

router.get('/ward', async (req, res) => {
  try {
    res.json(await wardInfo({ withComplaint: !isFrontDesk(req) }));
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
    const rows = await Admission.list({ patientId: req.params.patientId });
    res.json(isFrontDesk(req) ? rows.map(svc.redactAdmission) : rows);
  } catch (err) { routeError(res, err); }
});

// Everything we already know about the patient, so staff do not retype it.
router.get('/prefill/:patientId', requireClinical, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const [consultations, pregnancies, active, settings, priorStays] = await Promise.all([
      Consultation.findByPatientId(patient.id),
      Pregnancy.findByPatientId(patient.id),
      Admission.findActiveByPatient(patient.id),
      ClinicOption.getSettingsMap(),
      Admission.list({ patientId: patient.id })
    ]);
    const latest = consultations[0] || null;
    const pregnancy = pregnancies.find((p) => p.status === 'Ongoing') || null;
    res.json({
      patient: {
        id: patient.id, first_name: patient.first_name, last_name: patient.last_name, age: patient.age,
        allergies: patient.allergies || null
      },
      record: svc.buildPatientRecord(patient),
      suggestedAdmissionType: svc.suggestAdmissionType({
        priorAdmissions: (priorStays || []).length, consultations: (consultations || []).length
      }),
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
    const rows = await Admission.list({ status, month, patientId });
    res.json(isFrontDesk(req) ? rows.map(svc.redactAdmission) : rows);
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
    const ward = await wardInfo();
    if (value.bed_number === '' || value.bed_number === null || value.bed_number === undefined) {
      value.bed_number = ward.freeBeds[0] ?? null;
      if (!value.bed_number) {
        return res.status(409).json({
          code: 'WARD_FULL',
          message: `The ${ward.name.toLowerCase()} is full (${ward.totalBeds} of ${ward.totalBeds} beds in use). Discharge a patient first.`
        });
      }
    } else {
      value.bed_number = Number(value.bed_number);
      const bedInfo = ward.beds.find((b) => b.number === value.bed_number);
      if (!bedInfo) return res.status(400).json({ message: `There is no Bed ${value.bed_number}. The ${ward.name.toLowerCase()} has ${ward.totalBeds} beds.` });
      if (bedInfo.admission) {
        return res.status(409).json({
          code: 'BED_TAKEN',
          message: `Bed ${value.bed_number} is taken by ${bedInfo.admission.first_name} ${bedInfo.admission.last_name}. Please choose another bed.`
        });
      }
    }
    value.bed_price = ward.bedPrice;
    if (!value.admission_type) {
      const [priorStays, consultations] = await Promise.all([
        Admission.list({ patientId: value.patient_id }), Consultation.findByPatientId(value.patient_id)
      ]);
      value.admission_type = svc.suggestAdmissionType({
        priorAdmissions: (priorStays || []).length, consultations: (consultations || []).length
      });
    }
    let id;
    try {
      id = await Admission.create(value, req.user.id);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ code: 'BED_TAKEN', message: 'That bed was just taken. Please choose another bed.' });
      throw err;
    }
    await audit(req, 'CREATE', id, undefined, value);
    res.status(201).json({ id, bed_number: value.bed_number, message: 'Patient admitted' });
  } catch (err) { routeError(res, err); }
});

// ── One stay ────────────────────────────────────────────────────────────
router.get('/:id', loadAdmission(), async (req, res) => {
  try {
    const a = req.admission;
    const [delivery, items, discharge, followups, referral, settings, checklist] = await Promise.all([
      Admission.getDelivery(a.id), Admission.listItems(a.id), Admission.getDischarge(a.id),
      Admission.listFollowupsForAdmission(a.id), Admission.getReferral(a.id), ClinicOption.getSettingsMap(),
      Admission.getChecklist(a.id)
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
    const bed = stayBed(a, discharge, referral);
    const itemsSum = svc.itemsTotal(items);
    const packages = await resolvePackages(a.philhealth_packages);
    const record = svc.buildPatientRecord(await Patient.findById(a.patient_id));
    const bundle = {
      admission: a, record, delivery, items, itemsTotal: itemsSum, bed, wardName: settings.ward_name || 'Ward',
      packages, philhealthTotal: Math.round((packages.reduce((s, p) => s + p.amount, 0) + Number.EPSILON) * 100) / 100,
      grandTotal: Math.round((itemsSum + bed.amount + Number.EPSILON) * 100) / 100,
      discharge, followups, referral, warnings, locked: !svc.isActiveStatus(a.status),
      checklist: checklist || null, checklistDefinition: svc.CHECKLIST_DEFINITION, dischargeResults: svc.DISCHARGE_RESULTS,
      checklistStatus: svc.checklistStatus({ checklist, hasDelivery: Boolean(delivery) })
    };
    res.json(isFrontDesk(req) ? svc.redactBundle(bundle) : bundle);
  } catch (err) { routeError(res, err); }
});

router.put('/:id', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateAdmissionUpdate(req.body);
    if (error) return bad(res, error);
    if (value.bed_number !== undefined) {
      const wantsMove = value.bed_number !== '' && value.bed_number !== null && Number(value.bed_number) !== req.admission.bed_number;
      if (!svc.isActiveStatus(req.admission.status) || !wantsMove) {
        delete value.bed_number;
      } else {
        value.bed_number = Number(value.bed_number);
        const ward = await wardInfo();
        if (value.bed_number > ward.totalBeds) {
          return res.status(400).json({ message: `There is no Bed ${value.bed_number}. The ${ward.name.toLowerCase()} has ${ward.totalBeds} beds.` });
        }
        const holder = await Admission.findActiveByBed(value.bed_number, req.admission.id);
        if (holder) {
          return res.status(409).json({ code: 'BED_TAKEN', message: `Bed ${value.bed_number} is taken by ${holder.first_name} ${holder.last_name}.` });
        }
      }
    }
    try {
      await Admission.update(req.params.id, value);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ code: 'BED_TAKEN', message: 'That bed was just taken. Please choose another bed.' });
      throw err;
    }
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

// ── Midwives' Notes ─────────────────────────────────────────────────────
// Date, time and author are set here, never by the browser. Saved notes are locked:
// only the administrator can correct one (and the correction is logged).
const withNoteMeta = (n) => ({ ...n, initials: svc.initialsOf(n.author_name), shift: svc.shiftOf(n.noted_at) });

router.get('/:id/notes', requireClinical, loadAdmission(), async (req, res) => {
  try {
    res.json((await Admission.listNotes(req.params.id)).map(withNoteMeta));
  } catch (err) { routeError(res, err); }
});

router.post('/:id/notes', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateMidwifeNote(req.body);
    if (error) return bad(res, error);
    const id = await Admission.addNote(req.params.id, value.description, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id) }, 'midwife_notes');
    res.status(201).json({ id, message: 'Note saved' });
  } catch (err) { routeError(res, err); }
});

router.put('/:id/notes/:noteId', requireRole('admin'), loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateMidwifeNote(req.body);
    if (error) return bad(res, error);
    const old = await Admission.findNote(req.params.id, req.params.noteId);
    if (!old) return res.status(404).json({ message: 'Note not found' });
    await Admission.updateNote(req.params.id, req.params.noteId, value.description);
    await audit(req, 'UPDATE', Number(req.params.noteId), { description: old.description }, { description: value.description }, 'midwife_notes');
    res.json({ message: 'Note corrected' });
  } catch (err) { routeError(res, err); }
});

// ── Pre-discharge checklist ─────────────────────────────────────────────
// The patient cannot be discharged home until it is complete and no danger sign is present.
router.put('/:id/checklist', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateChecklist(req.body);
    if (error) return bad(res, error);
    await Admission.saveChecklist(req.params.id, value, req.user.id);
    await audit(req, 'UPDATE', Number(req.params.id), undefined, { checklist: value }, 'discharge_checklists');
    const delivery = await Admission.getDelivery(req.params.id);
    res.json({ message: 'Checklist saved', status: svc.checklistStatus({ checklist: value, hasDelivery: Boolean(delivery) }) });
  } catch (err) { routeError(res, err); }
});

// ── Labor chart ─────────────────────────────────────────────────────────
// Separate from the Midwives' Notes. Time and author are set by the server.
router.get('/:id/labor', requireClinical, loadAdmission(), async (req, res) => {
  try {
    res.json(await Admission.listLabor(req.params.id));
  } catch (err) { routeError(res, err); }
});

router.post('/:id/labor', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateLaborEntry(req.body);
    if (error) return bad(res, error);
    const id = await Admission.addLabor(req.params.id, value, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id) }, 'labor_entries');
    res.status(201).json({ id, message: 'Labor entry saved' });
  } catch (err) { routeError(res, err); }
});

// ── Vital signs ─────────────────────────────────────────────────────────
// Each reading is stamped with the server time and the logged-in user, then scored.
router.get('/:id/vitals', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const rows = await Admission.listVitals(req.params.id);
    res.json(rows.map((r) => ({ ...r, score: svc.scoreVitals(r) })));
  } catch (err) { routeError(res, err); }
});

router.post('/:id/vitals', requireClinical, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateVitals(req.body);
    if (error) return bad(res, error);
    const id = await Admission.addVitals(req.params.id, value, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id), ...value }, 'admission_vitals');
    res.status(201).json({ id, score: svc.scoreVitals(value), message: 'Vital signs saved' });
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

// PhilHealth packages for the stay (delivery, newborn, ...). Part of the payment step,
// so it stays open after discharge just like items do.
router.put('/:id/packages', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred. Ask the clinic administrator to change the packages.' });
    }
    const { error, value } = validatePackages(req.body);
    if (error) return bad(res, error);
    const available = await ClinicOption.list({ group: 'package', includeInactive: false });
    const previous = Array.isArray(req.admission.philhealth_packages) ? req.admission.philhealth_packages : [];
    // Packages that were already on the stay may stay even if the clinic later hid them.
    const unknown = value.packages.filter((c) => !previous.includes(c) && !available.some((o) => o.code === c));
    if (unknown.length) return res.status(400).json({ message: 'One of those packages is not available. Please choose from the list.' });
    await Admission.update(req.params.id, { philhealth_packages: value.packages });
    await audit(req, 'UPDATE', Number(req.params.id), { philhealth_packages: previous }, { philhealth_packages: value.packages });
    res.json({ message: 'PhilHealth packages saved' });
  } catch (err) { routeError(res, err); }
});

// Turn the items used into a Consultation Transaction the front desk can collect.
router.post('/:id/transaction', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    const a = req.admission;
    const [items, discharge, referral] = await Promise.all([Admission.listItems(a.id), Admission.getDischarge(a.id), Admission.getReferral(a.id)]);
    const bed = stayBed(a, discharge, referral);
    const packages = await resolvePackages(a.philhealth_packages);
    if (!items.length && !packages.length && bed.amount <= 0) {
      return res.status(400).json({ message: 'Add at least one item used (or choose a PhilHealth package, or set the bed price) first.' });
    }
    const payload = svc.buildTransactionPayload({ items, packages, bed });

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
    const reason = svc.DISCHARGE_REASONS.find((r) => r.code === value.disposition);
    if (!reason) {
      return res.status(400).json({ message: 'Please choose why the patient is going home from the list.' });
    }
    const [delivery, settings] = await Promise.all([Admission.getDelivery(a.id), ClinicOption.getSettingsMap()]);
    if (!svc.CHECKLIST_EXEMPT_DISPOSITIONS.includes(value.disposition)) {
      const check = svc.checklistStatus({ checklist: await Admission.getChecklist(a.id), hasDelivery: Boolean(delivery) });
      if (check.dangerPresent.length) {
        return res.status(409).json({
          code: 'DANGER_SIGNS',
          message: 'A danger sign was found, so the patient should not go home. Refer the patient to the hospital immediately.'
        });
      }
      if (!check.complete) {
        return res.status(409).json({
          code: 'CHECKLIST_INCOMPLETE',
          missing: check.missing,
          message: 'Please finish the pre-discharge checklist before sending the patient home.'
        });
      }
    }
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
