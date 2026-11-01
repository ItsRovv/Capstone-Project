const express = require('express');
const router = express.Router();
const Admission = require('../models/Admission');
const ClinicOption = require('../models/ClinicOption');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Pregnancy = require('../models/Pregnancy');
const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const ConsultationTransaction = require('../models/ConsultationTransaction');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireAdmissionAccess, requireClinical, requireClinicalSigner } = require('../middleware/role');
const {
  validateAdmission, validateAdmissionUpdate, validateDelivery, validateAdmissionItem,
  validateDischarge, validateReferral, validatePackages, validateMidwifeNote, validateVitals, validateLaborEntry, validateChecklist,
  validateReason, validateItemQuantity, validateNoteCorrection, validateMedication
} = require('../middleware/validation');
const User = require('../models/User');
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

// Turns the request for one item into the line to save: price, unit and charged flag come from the
// clinic's list; quantity and allergy rules are checked here, not only on the screen.
async function buildItemLine(value, admission) {
  const q = svc.checkQuantity(value.quantity, { confirmLarge: value.confirm_large });
  if (!q.ok) return { fail: { status: q.code === 'LARGE_QUANTITY' ? 409 : 400, body: { code: q.code, message: q.message } } };
  let { label, unit_price: unitPrice, unit } = value;
  let charged = true;
  let priceMissing = false;
  let allergyTags = null;
  let unlisted = false;
  if (value.option_id) {
    const option = await ClinicOption.findById(value.option_id);
    if (!option || option.option_group !== 'item' || !option.active) {
      return { fail: { status: 400, body: { message: 'That item is not available. Please choose from the list.' } } };
    }
    label = option.label;
    unit = unit || option.unit || null;
    charged = option.charged !== false;
    allergyTags = option.allergy_tags;
    if (unitPrice === undefined) {
      priceMissing = charged && (option.price === null || option.price === undefined);
      unitPrice = priceMissing ? 0 : Number(option.price);
    }
  } else {
    unlisted = true;
    if (unitPrice === undefined) priceMissing = true;
  }
  let note = null;
  const patient = await Patient.findById(admission.patient_id);
  const allergy = svc.allergyConflict(svc.buildPatientRecord(patient)?.allergies, { label, allergy_tags: allergyTags });
  if (allergy) {
    if (!value.allergy_reason) {
      return { fail: { status: 409, body: { code: 'ALLERGY', allergy, message: `Allergy warning: the patient is allergic to ${allergy}, and ${label} may contain or belong to it. Confirm with a reason to continue.` } } };
    }
    note = `Allergy warning (${allergy}) confirmed: ${value.allergy_reason}`;
  }
  return {
    line: {
      option_id: value.option_id || null, label, unit_price: unitPrice ?? 0, quantity: Number(value.quantity), given_at: value.given_at,
      unit, charged, price_missing: priceMissing, used_for: value.used_for || 'mother', unlisted, note
    }
  };
}

// A patient under 18 needs a guardian as the consent signer, with name and relationship.
function consentProblem(merged, patient) {
  if (!merged.consent_signed) return null;
  const age = svc.ageFromBirthDate(patient?.date_of_birth, patient?.age);
  if (age !== null && age !== undefined && age < 18) {
    if (merged.consent_signer_type !== 'guardian' || !String(merged.consent_by || '').trim() || !String(merged.consent_relationship || '').trim()) {
      return 'The patient is under 18. Consent must be signed by a guardian: choose "Guardian" and enter the name and relationship.';
    }
  }
  return null;
}

// Keeps usage lines in step with newborn care ticked on the Baby step: one line per baby and care item.
async function syncNewbornItems(admission, newborns, userId) {
  const wanted = svc.newbornItemRefs(newborns);
  const live = (await Admission.liveRefKeys(admission.id)) || [];
  const liveKeys = new Set(live.map((r) => r.ref_key));
  for (const ref of wanted) {
    if (liveKeys.has(ref.ref_key)) continue;
    const option = await ClinicOption.findByGroupCode('item', ref.item_code);
    if (!option || !option.active) continue;
    const priceMissing = option.charged !== false && (option.price === null || option.price === undefined);
    await Admission.addItem(admission.id, {
      option_id: option.id, label: option.label, unit_price: priceMissing ? 0 : Number(option.price), quantity: 1,
      unit: option.unit || null, charged: option.charged !== false, price_missing: priceMissing,
      used_for: ref.used_for, ref_key: ref.ref_key
    }, userId);
  }
  const wantedKeys = new Set(wanted.map((r) => r.ref_key));
  for (const row of live) {
    if (/^baby\d+:/.test(row.ref_key) && !wantedKeys.has(row.ref_key)) {
      await Admission.voidItem(admission.id, row.id, 'Removed from the baby\'s care record', userId);
    }
  }
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

// Latest delivery for a patient — used to prefill postpartum/postnatal care.
router.get('/patient/:patientId/latest-delivery', async (req, res) => {
  try {
    const delivery = await Admission.findLatestDeliveryByPatient(req.params.patientId);
    res.json(delivery || null);
  } catch (err) { routeError(res, err); }
});

// ── Item usage report ────────────────────────────────────────────────────
// How many diapers, gloves, gauze or ampules were used between two dates. Usage only, no stock.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

router.get('/reports/item-usage', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() + 8 * 3600000 - 6 * 86400000).toISOString().slice(0, 10);
    const { from = weekAgo, to = today, category } = req.query;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ message: 'from and to must look like 2026-10-31' });
    if (from > to) return res.status(400).json({ message: 'The start date must be before the end date.' });
    const rows = await Admission.itemUsageReport({ from, to, category: category || undefined });
    if (req.query.format === 'csv') {
      const lines = [['Category', 'Item', 'Unit', 'Quantity used', 'Admissions', 'Amount (for reference)'].map(csvCell).join(',')];
      for (const r of rows) {
        lines.push([r.category, r.label, r.unit, r.total_quantity, r.admissions, r.charged ? r.amount : 'Not charged'].map(csvCell).join(','));
      }
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="item-usage-${from}-to-${to}.csv"`);
      return res.send(lines.join('\r\n'));
    }
    res.json({ from, to, rows });
  } catch (err) { routeError(res, err); }
});

// Staff who can be chosen as attending physician or birth attendant.
router.get('/staff', requireClinical, async (req, res) => {
  try {
    res.json((await User.listClinicalStaff()) || []);
  } catch (err) { routeError(res, err); }
});

// Admission and discharge statistics for a period (daily, weekly, monthly or a trimester).
router.get('/reports/summary', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const { from = today, to = today } = req.query;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ message: 'from and to must look like 2026-10-31' });
    if (from > to) return res.status(400).json({ message: 'The start date must be before the end date.' });
    res.json({ from, to, ...(await Admission.statsForRange(from, to)) });
  } catch (err) { routeError(res, err); }
});

// Everything we already know about the patient, so staff do not retype it.
router.get('/prefill/:patientId', requireClinical, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    const [consultations, pregnancies, active, settings, priorStays, tracking] = await Promise.all([
      Consultation.findByPatientId(patient.id),
      Pregnancy.findByPatientId(patient.id),
      Admission.findActiveByPatient(patient.id),
      ClinicOption.getSettingsMap(),
      Admission.list({ patientId: patient.id }),
      PregnancyTrackingForm.findLatestRowForPatient(patient.id)
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
      pregnancy: (pregnancy || tracking) && {
        ...(pregnancy && {
          id: pregnancy.id, lmp: pregnancy.lmp, edd: pregnancy.edd, gp: pregnancy.gp, ob_index: pregnancy.ob_index, weeks: pregnancy.weeks, trimester: pregnancy.trimester
        }),
        tracking: tracking && pick(tracking, ['month_year', 'edd', 'obIndex', 'docSubmitted', 'deliveryDate'])
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
    const consentIssue = consentProblem(value, patient);
    if (consentIssue) return res.status(400).json({ code: 'GUARDIAN_REQUIRED', message: consentIssue });
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
    const coversPhilhealth = String(a.medicare || '').startsWith('philhealth');
    if (coversPhilhealth && !a.philhealth_pin && !svc.buildPatientRecord(await Patient.findById(a.patient_id))?.philhealth_pin) {
      warnings.push({ code: 'NO_PHILHEALTH_PIN', message: 'PhilHealth coverage is chosen but the member PIN is missing.' });
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
    const totalStatus = svc.incompleteTotal(items, bed);
    const packages = await resolvePackages(a.philhealth_packages);
    const record = svc.buildPatientRecord(await Patient.findById(a.patient_id));
    const [pregnancies, tracking] = await Promise.all([
      Pregnancy.findByPatientId(a.patient_id),
      PregnancyTrackingForm.findLatestRowForPatient(a.patient_id)
    ]);
    const pregnancy = (pregnancies || []).find(
      (p) => !['delivered', 'discharged', 'completed'].includes(String(p.status || '').toLowerCase())
    ) || (pregnancies || [])[0] || null;
    const bundle = {
      admission: a, record,
      pregnancy: (pregnancy || tracking) && {
        ...(pregnancy && pick(pregnancy, ['id', 'lmp', 'edd', 'gp', 'ob_index', 'weeks', 'trimester'])),
        tracking: tracking && pick(tracking, ['month_year', 'edd', 'obIndex', 'docSubmitted', 'deliveryDate'])
      },
      delivery, items, itemsTotal: itemsSum, totalStatus, bed, wardName: settings.ward_name || 'Ward',
      packages, philhealthTotal: Math.round((packages.reduce((s, p) => s + p.amount, 0) + Number.EPSILON) * 100) / 100,
      grandTotal: Math.round((itemsSum + bed.amount + Number.EPSILON) * 100) / 100,
      discharge, followups, referral, warnings, locked: !svc.isActiveStatus(a.status),
      progress: (await Admission.stepCounts(a.id)) || { notes: 0, completeVitals: 0, labor: 0 },
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
    if (value.consent_signed !== undefined || value.consent_signer_type !== undefined || value.consent_by !== undefined || value.consent_relationship !== undefined) {
      const problem = consentProblem({ ...req.admission, ...value }, await Patient.findById(req.admission.patient_id));
      if (problem) return res.status(400).json({ code: 'GUARDIAN_REQUIRED', message: problem });
    }
    try {
      await Admission.update(req.params.id, value);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ code: 'BED_TAKEN', message: 'That bed was just taken. Please choose another bed.' });
      throw err;
    }
    if (value.bed_number !== undefined && value.bed_number !== req.admission.bed_number) {
      await Admission.logBedMove(req.params.id, req.admission.bed_number, value.bed_number, req.user.id);
    }
    await audit(req, 'UPDATE', Number(req.params.id), req.admission, value);
    res.json({ message: 'Admission updated' });
  } catch (err) { routeError(res, err); }
});

// "Continue at clinic" for a referral-level warning sign. The reason is required and
// who/when are stamped by the server.
router.post('/:id/risk-ack', requireClinicalSigner, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateReason(req.body);
    if (error) return bad(res, error);
    await Admission.acknowledgeRisk(req.params.id, value.reason, req.user.id);
    await audit(req, 'UPDATE', Number(req.params.id), undefined, { risk_ack: true, flags: svc.referralLevelFlags(req.admission.risk_flags) });
    res.status(201).json({ message: 'Decision recorded' });
  } catch (err) { routeError(res, err); }
});

router.post('/:id/status', requireClinicalSigner, loadAdmission(), async (req, res) => {
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

router.put('/:id/delivery', requireClinicalSigner, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateDelivery(req.body);
    if (error) return bad(res, error);
    const a = req.admission;
    if (!['admitted', 'in_labor', 'delivered'].includes(a.status) && req.user.role !== 'admin') {
      return res.status(409).json({ message: 'Delivery cannot be recorded for this stay.' });
    }
    if (value.delivery_type === 'referred') {
      return res.status(400).json({ message: 'Use "Refer patient" to refer during labor or delivery.' });
    }
    const timing = svc.checkDeliveryTime(value.delivered_at, a.admitted_at);
    if (timing) return res.status(400).json({ code: timing.code, message: timing.message });
    const noSex = (value.newborns || []).findIndex((b) => b.birth_status !== 'stillbirth' && !b.sex);
    if (noSex >= 0) {
      return res.status(400).json({ code: 'BABY_SEX', message: `Choose the sex for ${value.newborns.length > 1 ? `baby ${noSex + 1}` : 'the baby'}. It is required for a live birth.` });
    }
    if (value.attendant_ids?.length) {
      const staff = (await User.listClinicalStaff()) || [];
      const names = value.attendant_ids.map((id) => staff.find((s) => Number(s.id) === Number(id))?.name);
      if (names.some((n) => !n)) return res.status(400).json({ message: 'Choose attendants from the list of midwives and doctors.' });
      value.attendant = names.join(', ');
    }
    const conflict = svc.deliveryRiskConflict({
      riskFlags: a.risk_flags, ackReason: a.risk_ack_reason, deliveryType: value.delivery_type
    });
    if (conflict) {
      return res.status(409).json({
        code: 'RISK_CONFLICT',
        flags: conflict.flags,
        message: `This patient has a referral-level risk flag (${conflict.labels.join(', ')}). Refer, or confirm with a reason.`
      });
    }
    const deliveryId = await Admission.saveDelivery(a.id, value);
    await syncNewbornItems(a, value.newborns, req.user.id).catch((e) => console.warn('[admission] newborn items sync failed:', e.message));
    await audit(req, 'UPDATE', a.id, undefined, { delivery: value }, 'deliveries');
    onDelivered(a, { delivered_at: value.delivered_at }).catch((e) => console.warn('[admission] pregnancy sync failed:', e.message));
    res.json({
      id: deliveryId, message: 'Delivery recorded',
      // Any ticked problem, or a low-weight / low-APGAR baby, should prompt a referral on screen.
      referralPrompt: [
        ...(value.problems || []),
        ...(value.newborns || []).flatMap((b) => svc.newbornReferralReasons(b))
      ]
    });
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

router.post('/:id/notes', requireClinicalSigner, loadAdmission(), async (req, res) => {
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
    const { error, value } = validateNoteCorrection(req.body);
    if (error) return bad(res, error);
    const old = await Admission.findNote(req.params.id, req.params.noteId);
    if (!old) return res.status(404).json({ message: 'Note not found' });
    await Admission.updateNote(req.params.id, req.params.noteId, value.description, value.reason, req.user.id);
    await audit(req, 'UPDATE', Number(req.params.noteId), { description: old.description }, { description: value.description, reason: value.reason }, 'midwife_notes');
    res.json({ message: 'Note corrected. The original text is kept in the history.' });
  } catch (err) { routeError(res, err); }
});

// ── Medications given (clinical record, separate from the items summary) ─────
router.get('/:id/medications', requireClinical, loadAdmission(), async (req, res) => {
  try {
    res.json((await Admission.listMedications(req.params.id)) || []);
  } catch (err) { routeError(res, err); }
});

router.post('/:id/medications', requireClinicalSigner, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateMedication(req.body);
    if (error) return bad(res, error);
    const patient = await Patient.findById(req.admission.patient_id);
    const allergy = svc.allergyConflict(svc.buildPatientRecord(patient)?.allergies, { label: value.drug });
    if (allergy && !value.allergy_reason) {
      return res.status(409).json({ code: 'ALLERGY', allergy, message: `Allergy warning: the patient is allergic to ${allergy}. Confirm with a reason to continue.` });
    }
    const note = allergy ? `Allergy warning (${allergy}) confirmed: ${value.allergy_reason}` : null;
    const id = await Admission.addMedication(req.params.id, { ...value, note }, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id), drug: value.drug }, 'medications_given');
    res.status(201).json({ id, message: 'Medication recorded' });
  } catch (err) { routeError(res, err); }
});

// Read-only history of changes on one admission, for the administrator and doctors.
router.get('/:id/history', requireRole('admin', 'doctor'), loadAdmission(), async (req, res) => {
  try {
    res.json((await AuditLog.forAdmission(req.params.id)) || []);
  } catch (err) { routeError(res, err); }
});

router.get('/:id/bed-moves', requireClinical, loadAdmission(), async (req, res) => {
  try {
    res.json((await Admission.listBedMoves(req.params.id)) || []);
  } catch (err) { routeError(res, err); }
});

// ── Pre-discharge checklist ─────────────────────────────────────────────
// The patient cannot be discharged home until it is complete and no danger sign is present.
router.put('/:id/checklist', requireClinicalSigner, loadAdmission(), async (req, res) => {
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

router.post('/:id/labor', requireClinicalSigner, loadAdmission(), async (req, res) => {
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

router.post('/:id/vitals', requireClinicalSigner, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateVitals(req.body);
    if (error) return bad(res, error);
    const id = await Admission.addVitals(req.params.id, value, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id), ...value }, 'admission_vitals');
    res.status(201).json({
      id, score: svc.scoreVitals(value), referralReasons: svc.vitalsReferralReasons(value), message: 'Vital signs saved'
    });
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
    const built = await buildItemLine(value, req.admission);
    if (built.fail) return res.status(built.fail.status).json(built.fail.body);
    const id = await Admission.addItem(req.params.id, built.line, req.user.id);
    await audit(req, 'CREATE', id, undefined, { admission_id: Number(req.params.id), label: built.line.label, quantity: built.line.quantity }, 'admission_items');
    res.status(201).json({ id, message: 'Item added' });
  } catch (err) { routeError(res, err); }
});

// Apply a bundle (for example the "Normal delivery pack") as separate usage lines.
router.post('/:id/items/bundle/:optionId', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred. Ask the clinic administrator to add items.' });
    }
    const bundle = await ClinicOption.findById(req.params.optionId);
    if (!bundle || bundle.option_group !== 'bundle' || !bundle.active || !Array.isArray(bundle.bundle_items)) {
      return res.status(404).json({ message: 'That bundle is not available.' });
    }
    const added = [];
    for (const part of bundle.bundle_items) {
      const option = await ClinicOption.findByGroupCode('item', part.code);
      if (!option || !option.active) continue;
      // No allergy override here: a bundle containing something she is allergic to is refused.
      const built = await buildItemLine({ option_id: option.id, quantity: part.quantity, used_for: 'mother' }, req.admission);
      if (built.fail) return res.status(built.fail.status).json(built.fail.body);
      added.push(await Admission.addItem(req.params.id, built.line, req.user.id));
    }
    await audit(req, 'CREATE', Number(req.params.id), undefined, { bundle: bundle.code, lines: added.length }, 'admission_items');
    res.status(201).json({ added: added.length, message: `${bundle.label} added (${added.length} items)` });
  } catch (err) { routeError(res, err); }
});

// Correct a quantity: the old line is voided (with a reason) and a corrected one is added.
router.put('/:id/items/:itemId', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred. Ask the clinic administrator to change items.' });
    }
    const { error, value } = validateItemQuantity(req.body);
    if (error) return bad(res, error);
    const check = svc.checkQuantity(value.quantity, { confirmLarge: value.confirm_large });
    if (!check.ok) return res.status(check.code === 'LARGE_QUANTITY' ? 409 : 400).json({ code: check.code, message: check.message });
    const newId = await Admission.replaceItem(req.params.id, req.params.itemId, value.quantity, value.reason, req.user.id);
    if (!newId) return res.status(404).json({ message: 'Item not found or already voided' });
    await audit(req, 'UPDATE', Number(req.params.itemId), undefined, { admission_id: Number(req.params.id), quantity: value.quantity, reason: value.reason }, 'admission_items');
    res.json({ id: newId, message: 'Quantity corrected. The old line stays in the history as voided.' });
  } catch (err) { routeError(res, err); }
});

// "Remove" never deletes: the line is voided with a reason, who and when, and leaves the totals.
router.post('/:id/items/:itemId/void', requireClinical, loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    if (req.admission.status === 'referred' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'This stay was referred. Ask the clinic administrator to remove items.' });
    }
    const { error, value } = validateReason(req.body);
    if (error) return bad(res, error);
    const ok = await Admission.voidItem(req.params.id, req.params.itemId, value.reason, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Item not found or already voided' });
    await audit(req, 'DELETE', Number(req.params.itemId), { admission_id: Number(req.params.id) }, { voided: true, reason: value.reason }, 'admission_items');
    res.json({ message: 'Item voided. It stays in the history.' });
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
    if (value.packages.length) {
      const record = svc.buildPatientRecord(await Patient.findById(req.admission.patient_id));
      const covered = String(req.admission.medicare || '').startsWith('philhealth');
      if (!covered || !(req.admission.philhealth_pin || record?.philhealth_pin)) {
        return res.status(409).json({
          code: 'NO_COVERAGE',
          message: 'Choose PhilHealth under Coverage on the Admit step and enter the member PIN before ticking a package.'
        });
      }
    }
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
    const incomplete = svc.incompleteTotal(items, bed);
    if (incomplete.incomplete && !req.body?.confirm_incomplete) {
      return res.status(409).json({
        code: 'INCOMPLETE_TOTAL',
        message: 'Some items or the bed have no price yet, so this total is not final. Confirm to send it anyway.',
        unpriced: incomplete.unpricedLabels, bedUnpriced: incomplete.bedUnpriced
      });
    }
    const waivedReason = typeof req.body?.waived_reason === 'string' ? req.body.waived_reason.trim().slice(0, 300) : '';
    if (payload.total_amount === 0 && !packages.length && !incomplete.incomplete && !waivedReason) {
      return res.status(409).json({ code: 'ZERO_TOTAL', message: 'The total is 0. Confirm with a reason (for example free or waived) to send it.' });
    }

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
        recommendations: `Admission #${a.id}: items used during stay${waivedReason ? `. Total waived: ${waivedReason}` : ''}`, ...payload
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
router.post('/:id/discharge', requireClinicalSigner, loadAdmission(), async (req, res) => {
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
    const conditionProblem = svc.dischargeConditionProblem(value);
    if (conditionProblem) return res.status(400).json({ code: 'BAD_CONDITION', message: conditionProblem });
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
    const blockers = svc.dischargeBlockers({
      delivery, riskFlags: a.risk_flags, riskAckReason: a.risk_ack_reason,
      disposition: value.disposition, hasOverride: Boolean(value.override_reason)
    });
    if (blockers.length) {
      return res.status(409).json({ code: blockers[0].code, blockers, message: blockers.map((b) => b.message).join(' ') });
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
router.post('/:id/referral', requireClinicalSigner, loadAdmission(), async (req, res) => {
  try {
    const { error, value } = validateReferral(req.body);
    if (error) return bad(res, error);
    if (!svc.canTransition(req.admission.status, 'referred')) {
      return res.status(409).json({ message: `A patient who is "${req.admission.status}" cannot be referred.` });
    }
    const id = await Admission.refer(req.params.id, value, req.user.id);
    await audit(req, 'UPDATE', Number(req.params.id), { status: req.admission.status }, { status: 'referred', facility: value.facility });
    res.status(201).json({ id, message: 'Patient referred' });
  } catch (err) { routeError(res, err); }
});

// A doctor (or the administrator) can undo a referral with a reason; the locked steps reopen.
router.post('/:id/referral/reverse', requireRole('doctor', 'admin'), loadAdmission({ allowLockedFor: ['*'] }), async (req, res) => {
  try {
    const { error, value } = validateReason(req.body);
    if (error) return bad(res, error);
    if (req.admission.status !== 'referred') {
      return res.status(409).json({ message: 'This stay is not marked as referred.' });
    }
    const ok = await Admission.reverseReferral(req.params.id, value.reason, req.user.id);
    if (!ok) return res.status(404).json({ message: 'No active referral found for this stay.' });
    await audit(req, 'UPDATE', Number(req.params.id), { status: 'referred' }, { status: 'admitted', reversed: true }, 'referrals');
    res.json({ message: 'Referral reversed. The stay is open again.' });
  } catch (err) { routeError(res, err); }
});

module.exports = router;
