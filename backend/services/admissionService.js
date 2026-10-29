// Pure business rules for admission, delivery and discharge.
// Kept free of database access so they are easy to test and to change.

const ACTIVE_STATUSES = ['admitted', 'in_labor', 'delivered'];

// status -> statuses it may move to
const TRANSITIONS = {
  admitted: ['in_labor', 'delivered', 'discharged', 'referred'],
  in_labor: ['delivered', 'referred'],
  delivered: ['discharged'],
  discharged: [],
  referred: []
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(status);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function lineTotal(item) {
  return round2(Number(item.unit_price || 0) * Number(item.quantity || 0));
}

function itemsTotal(items = []) {
  return round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
}

// Reminder (not a block): has the patient stayed long enough since delivery/admission?
function checkMinStay(startedAt, minHours, now = new Date()) {
  const hours = (now.getTime() - new Date(startedAt).getTime()) / 3600000;
  const required = Number(minHours) || 0;
  return { ok: hours >= required, hoursStayed: Math.max(0, Math.floor(hours)), requiredHours: required };
}

// "72,168" -> [72, 168]
function parseOffsets(value) {
  return String(value || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function followupDueDates(dischargedAt, offsetsHours) {
  const base = new Date(dischargedAt).getTime();
  return offsetsHours.map((h) => new Date(base + h * 3600000));
}

// Split items into clinic-charged lines and PhilHealth package reference for Transactions.
function buildTransactionPayload({ items, packageOption, packageAmount }) {
  const vitamins = items
    .filter((it) => lineTotal(it) > 0 || it.label)
    .map((it) => ({
      id: it.option_id ? `item_${it.option_id}` : `custom_${it.id}`,
      label: Number(it.quantity) === 1 ? it.label : `${it.label} x${Number(it.quantity)}`,
      price: lineTotal(it),
      custom: !it.option_id
    }));
  const packages = packageOption
    ? [{ code: packageOption.code.toUpperCase().slice(0, 30), label: packageOption.label, amount: round2(packageAmount || 0) }]
    : [];
  return {
    vitamins,
    packages,
    total_amount: itemsTotal(items),
    philhealth_total: packages.reduce((s, p) => s + p.amount, 0)
  };
}


// Front-desk staff see who is admitted, the status and the billing items, but not clinical content.
const CLINICAL_ADMISSION_FIELDS = [
  'chief_complaint', 'admitting_diagnosis', 'bp', 'pulse', 'resp_rate', 'temperature',
  'labor_notes', 'risk_flags', 'notes', 'consent_by'
];

function redactAdmission(a) {
  if (!a) return a;
  const out = { ...a };
  for (const f of CLINICAL_ADMISSION_FIELDS) delete out[f];
  return out;
}

function redactBundle(bundle) {
  return {
    ...bundle,
    admission: redactAdmission(bundle.admission),
    delivery: bundle.delivery && { id: bundle.delivery.id, delivered_at: bundle.delivery.delivered_at, babies: bundle.delivery.newborns?.length ?? 0 },
    discharge: bundle.discharge && { id: bundle.discharge.id, discharged_at: bundle.discharge.discharged_at, disposition: bundle.discharge.disposition },
    referral: bundle.referral && { id: bundle.referral.id, facility: bundle.referral.facility, referred_at: bundle.referral.referred_at },
    followups: (bundle.followups || []).map(({ notes, ...rest }) => rest),
    warnings: []
  };
}

module.exports = {
  ACTIVE_STATUSES,
  TRANSITIONS,
  canTransition,
  isActiveStatus,
  lineTotal,
  itemsTotal,
  checkMinStay,
  parseOffsets,
  followupDueDates,
  buildTransactionPayload,
  CLINICAL_ADMISSION_FIELDS,
  redactAdmission,
  redactBundle
};
