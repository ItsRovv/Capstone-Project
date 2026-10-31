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

// Calendar nights in Philippine time (UTC+8): arriving 11 pm and leaving 7 am
// is 1 night; staying 2 midnights is 2 nights. Never less than 1.
const PH_OFFSET_MS = 8 * 3600000;
const phDay = (d) => Math.floor((new Date(d).getTime() + PH_OFFSET_MS) / 86400000);

function countNights(start, end) {
  return Math.max(1, phDay(end) - phDay(start));
}

// Automatic bed charge: price per night was saved on the stay when it began.
function bedCharge({ bedNumber, pricePerNight, start, end }) {
  const price = pricePerNight === null || pricePerNight === undefined || pricePerNight === '' ? null : Number(pricePerNight);
  const nights = countNights(start, end);
  return {
    number: bedNumber ?? null,
    nights,
    pricePerNight: price,
    priceSet: price !== null,
    amount: bedNumber && price !== null ? round2(price * nights) : 0
  };
}

// Lowest free bed number, or null when the ward is full.
function firstFreeBed(totalBeds, takenBeds) {
  const taken = new Set(takenBeds.map(Number));
  for (let n = 1; n <= totalBeds; n++) if (!taken.has(n)) return n;
  return null;
}

// Split items into clinic-charged lines and PhilHealth package reference for Transactions.
function buildTransactionPayload({ items, packages: packageList = [], bed }) {
  const vitamins = items
    .filter((it) => lineTotal(it) > 0 || it.label)
    .map((it) => ({
      id: it.option_id ? `item_${it.option_id}` : `custom_${it.id}`,
      label: Number(it.quantity) === 1 ? it.label : `${it.label} x${Number(it.quantity)}`,
      price: lineTotal(it),
      custom: !it.option_id
    }));
  const packages = packageList.map((p) => ({ code: String(p.code).toUpperCase().slice(0, 30), label: p.label, amount: round2(p.amount || 0) }));
  if (bed && bed.amount > 0) {
    vitamins.unshift({
      id: 'bed_charge',
      label: `Bed ${bed.number} × ${bed.nights} night${bed.nights === 1 ? '' : 's'}`,
      price: bed.amount,
      custom: true
    });
  }
  return {
    vitamins,
    packages,
    total_amount: round2(itemsTotal(items) + (bed ? bed.amount : 0)),
    philhealth_total: packages.reduce((s, p) => s + p.amount, 0)
  };
}


// ── Admission and Discharge Record (auto-filled from the patient profile) ────
const ADMISSION_TYPES = ['new', 'old', 'former_opd'];

// Whole years between a birth date and today; falls back to the age saved on the profile.
function ageFromBirthDate(birthDate, savedAge = null, now = new Date()) {
  if (!birthDate) return savedAge === undefined || savedAge === '' ? null : savedAge;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return savedAge ?? null;
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}

const fullName = (first, last) => [first, last].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

// The read-only part of the record: nothing here is typed again by the midwife.
function buildPatientRecord(patient, now = new Date()) {
  if (!patient) return null;
  const info = patient.personal_info && typeof patient.personal_info === 'object' ? patient.personal_info : {};
  const medInfo = patient.medical_info && typeof patient.medical_info === 'object' ? patient.medical_info : {};
  const mommy = info.mommy || {};
  const daddy = info.daddy || {};
  const allergyList = [
    ...(String(patient.allergies || '').split(',').map((s) => s.trim())),
    ...(Array.isArray(medInfo.drug_food_allergies) ? medInfo.drug_food_allergies : [])
  ].filter(Boolean);
  const birthDate = patient.date_of_birth || mommy.date_of_birth || null;
  return {
    patient_id: patient.id,
    last_name: patient.last_name || mommy.last_name || null,
    first_name: patient.first_name || mommy.first_name || null,
    birth_date: birthDate,
    age: ageFromBirthDate(birthDate, patient.age ?? mommy.age ?? null, now),
    birthplace: mommy.birthplace || null,
    address: patient.address || mommy.address || null,
    contact_number: patient.contact_number || mommy.contact_number || null,
    sex: patient.sex || mommy.sex || null,
    civil_status: mommy.civil_status || null,
    nationality: mommy.nationality || null,
    religion: mommy.religion || null,
    mother_name: fullName(patient.first_name || mommy.first_name, patient.last_name || mommy.last_name) || null,
    father_name: fullName(daddy.first_name, daddy.last_name) || daddy.name || null,
    occupation: mommy.occupation || null,
    employer: mommy.employer || null,
    employer_address: mommy.employer_address || null,
    employer_tel: mommy.employer_tel || null,
    philhealth_pin: mommy.philhealth_pin || null,
    mother_tel: mommy.contact_number || null,
    father_address: daddy.address || null,
    father_tel: daddy.contact_number || null,
    allergies: allergyList.join(', ') || null
  };
}

// New = nothing on file yet. Old = she has been here before (an earlier stay or a check-up).
function suggestAdmissionType({ priorAdmissions = 0, consultations = 0 } = {}) {
  return priorAdmissions > 0 || consultations > 0 ? 'old' : 'new';
}

// ── Midwives' Notes ──────────────────────────────────────────────────────────
// "Maria Santos" -> "MS". The initials are only for accountability; the author is the logged-in user.
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The paper sheet uses ink colours per shift: blue 0800-1600, black 1600-0000, red 0000-0800 (Philippine time).
function shiftOf(date) {
  const hour = Math.floor(((new Date(date).getTime() + PH_OFFSET_MS) % 86400000) / 3600000);
  if (hour >= 8 && hour < 16) return 'morning';
  if (hour >= 16) return 'afternoon';
  return 'evening';
}

// ── Vital signs: early warning score ─────────────────────────────────────────
// Simplified from the All-Wales Maternity Early Warning Score (the usual colour-coded chart in
// maternity wards). Each reading gets 0 (normal), 1 (watch) or 2 (act) per sign. This is a
// reminder for the midwife, not a diagnosis: the clinic's doctor should confirm the limits.
const inRange = (v, lo, hi) => v >= lo && v <= hi;

const SIGN_RULES = {
  resp_rate: (v) => (v >= 25 || v <= 6 ? 2 : v >= 22 || v <= 8 ? 1 : 0),
  spo2: (v) => (v <= 92 ? 2 : v <= 94 ? 1 : 0),
  temperature: (v) => (v >= 37.5 || v <= 35.6 ? 2 : v >= 37.3 || v <= 36.1 ? 1 : 0),
  pulse: (v) => (v >= 122 || v <= 62 ? 2 : v >= 113 || v <= 70 ? 1 : 0),
  bp_systolic: (v) => (v >= 145 || v <= 93 ? 2 : v >= 136 || v <= 100 ? 1 : 0),
  bp_diastolic: (v) => (v >= 97 || v <= 56 ? 2 : v >= 89 || v <= 61 ? 1 : 0)
};

function scoreVitals(reading = {}) {
  const signs = {};
  let total = 0;
  for (const [sign, rule] of Object.entries(SIGN_RULES)) {
    const raw = reading[sign];
    if (raw === null || raw === undefined || raw === '' || Number.isNaN(Number(raw))) continue;
    const points = rule(Number(raw));
    signs[sign] = points;
    total += points;
  }
  const fhr = reading.fetal_heart_rate;
  const hasFhr = fhr !== null && fhr !== undefined && fhr !== '';
  const fetalAlert = hasFhr && !inRange(Number(fhr), 110, 160);
  const anyRed = Object.values(signs).includes(2);
  const level = anyRed || total >= 4 || fetalAlert ? 'urgent' : total >= 1 ? 'watch' : 'normal';
  return { signs, total, fetalAlert, level };
}

// ── The module's fixed lists ────────────────────────────────────────────
// These belong to the Admission and Discharge module itself: they used to be editable
// from Clinic Settings, now they live here so the two modules are independent.
const DISCHARGE_REASONS = [
  { code: 'improved', label: 'Improved - went home well' },
  { code: 'transferred', label: 'Transferred to another facility' },
  { code: 'hama', label: 'Went home against medical advice' },
  { code: 'absconded', label: 'Left without notice' },
  { code: 'expired', label: 'Passed away' },
  { code: 'well_baby', label: 'Well baby - discharged with mother' }
];

const DELIVERY_TYPES = [
  { code: 'nsd', label: 'Normal delivery' },
  { code: 'assisted', label: 'Assisted delivery' },
  { code: 'other', label: 'Other' }
];

const RISK_FLAGS = [
  { code: 'multiple_pregnancy', label: 'Twins or more' },
  { code: 'placenta_previa', label: 'Placenta covering the cervix (placenta previa)' },
  { code: 'previous_cs', label: 'Previous cesarean section' },
  { code: 'preeclampsia_history', label: 'Past pre-eclampsia or eclampsia' },
  { code: 'stillbirth_history', label: 'Past stillbirth or 3 or more miscarriages' },
  { code: 'hypertension', label: 'High blood pressure' },
  { code: 'diabetes', label: 'Diabetes' },
  { code: 'heart_disease', label: 'Heart disease' },
  { code: 'severe_anemia', label: 'Severe anemia' },
  { code: 'bleeding', label: 'Heavy bleeding' }
];

const NEWBORN_CARE = [
  { code: 'drying', label: 'Dried and wrapped right away' },
  { code: 'skin_to_skin', label: 'Skin-to-skin with mother' },
  { code: 'cord_care', label: 'Cord clamped and cared for' },
  { code: 'breastfeeding', label: 'Breastfeeding started' }
];

// -- Pre-discharge checklist --------------------------------------------------
// From the clinic's checklist, column "Within 24 hours and before discharge".
const CHECKLIST_ITEMS = [
  { code: 'danger_signs_checked', label: 'Observed for danger signs', requiresDelivery: false },
  { code: 'breastfeeding_started', label: 'Started breastfeeding within one hour after birth', requiresDelivery: true },
  { code: 'selfcare_info', label: 'Gave information on self-care after childbirth', requiresDelivery: true },
  { code: 'newborn_care_info', label: 'Gave information on newborn care', requiresDelivery: true },
  { code: 'wounds_checked', label: 'Checked for any birth-related wounds', requiresDelivery: true }
];

// If any of these is present the patient must be referred to the hospital, not sent home.
const DANGER_SIGNS = [
  { code: 'difficulty_breathing', label: 'Difficulty breathing' },
  { code: 'weakness_fatigue', label: 'Weakness or fatigue' },
  { code: 'fever', label: 'Fever' },
  { code: 'severe_abdominal_pain', label: 'Severe lower abdominal pain' },
  { code: 'foul_discharge', label: 'Foul-smelling vaginal discharge' },
  { code: 'excessive_bleeding', label: 'Excessive bleeding' }
];

// The "RESULTS" box at the bottom of the paper form. The 24h/48h entries only make
// sense together with "died", and autopsy choices the same — the UI groups them.
const DISCHARGE_RESULTS = [
  { code: 'recovered', label: 'Recovered' },
  { code: 'died', label: 'Died' },
  { code: 'died_24h', label: 'Within 24 hours' },
  { code: 'died_48h', label: 'Within 48 hours' },
  { code: 'improved', label: 'Improved' },
  { code: 'unimproved', label: 'Unimproved' },
  { code: 'autopsy', label: 'Autopsy' },
  { code: 'no_autopsy', label: 'No autopsy' }
];

// Leaving against advice, absconding, a transfer or a death cannot go through the normal checklist.
const CHECKLIST_EXEMPT_DISPOSITIONS = ['transferred', 'hama', 'absconded', 'expired'];

const CHECKLIST_DEFINITION = { items: CHECKLIST_ITEMS, dangerSigns: DANGER_SIGNS };

function checklistStatus({ checklist, hasDelivery }) {
  const items = (checklist && checklist.items) || {};
  const required = CHECKLIST_ITEMS.filter((i) => hasDelivery || !i.requiresDelivery);
  const missing = required.filter((i) => items[i.code] !== true).map((i) => i.code);
  const knownSigns = new Set(DANGER_SIGNS.map((d) => d.code));
  const dangerPresent = ((checklist && checklist.danger_signs) || []).filter((c) => knownSigns.has(c));
  return { complete: missing.length === 0, missing, dangerPresent, requiredCodes: required.map((i) => i.code) };
}

// Front-desk staff see who is admitted, the status and the billing items, but not clinical content.
const CLINICAL_ADMISSION_FIELDS = [
  'chief_complaint', 'admitting_diagnosis', 'bp', 'pulse', 'resp_rate', 'temperature',
  'labor_notes', 'risk_flags', 'notes', 'consent_by',
  'referred_by', 'informant_name', 'informant_address', 'informant_relationship'
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
    record: null,
    checklist: null,
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
  countNights,
  bedCharge,
  firstFreeBed,
  checkMinStay,
  parseOffsets,
  followupDueDates,
  buildTransactionPayload,
  ADMISSION_TYPES,
  initialsOf,
  shiftOf,
  scoreVitals,
  CHECKLIST_ITEMS,
  DANGER_SIGNS,
  CHECKLIST_EXEMPT_DISPOSITIONS,
  CHECKLIST_DEFINITION,
  DISCHARGE_RESULTS,
  DISCHARGE_REASONS,
  DELIVERY_TYPES,
  RISK_FLAGS,
  NEWBORN_CARE,
  checklistStatus,
  ageFromBirthDate,
  buildPatientRecord,
  suggestAdmissionType,
  CLINICAL_ADMISSION_FIELDS,
  redactAdmission,
  redactBundle
};
