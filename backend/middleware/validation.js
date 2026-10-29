const Joi = require('joi');
const { sanitizeObject, sanitizeDeep } = require('../utils/sanitizer');

// ── Personal Information (Mommy / Daddy / Emergency contact) — OB patients ──
const personInfoSchema = Joi.object({
  name: Joi.string().trim().max(150).allow(null, ''),
  birthday: Joi.date().iso().allow(null, ''),
  age: Joi.alternatives(Joi.number().integer().min(0).max(150), Joi.string().trim().max(10)).allow(null, ''),
  blood_type: Joi.string().trim().max(5).allow(null, ''),
  civil_status: Joi.string().trim().max(30).allow(null, ''),
  occupation: Joi.string().trim().max(100).allow(null, ''),
  phone: Joi.string().trim().max(30).allow(null, ''),
  fb_messenger: Joi.string().trim().max(150).allow(null, ''),
  address: Joi.string().trim().max(500).allow(null, '')
}).unknown(true);

const emergencyContactSchema = Joi.object({
  name: Joi.string().trim().max(150).allow(null, ''),
  relationship: Joi.string().trim().max(50).allow(null, ''),
  birthday: Joi.date().iso().allow(null, ''),
  age: Joi.alternatives(Joi.number().integer().min(0).max(150), Joi.string().trim().max(10)).allow(null, ''),
  phone: Joi.string().trim().max(30).allow(null, ''),
  fb_messenger: Joi.string().trim().max(150).allow(null, ''),
  address: Joi.string().trim().max(500).allow(null, '')
}).unknown(true);

const personalInfoSchema = Joi.object({
  mommy: personInfoSchema,
  daddy: personInfoSchema,
  emergency_contact: emergencyContactSchema
}).unknown(true).allow(null);

// ── Medical Information (allergies, medications, illness history) ──────────
const illnessRowSchema = Joi.object({
  condition: Joi.string().trim().max(150),
  personal: Joi.boolean(),
  family: Joi.boolean(),
  remarks: Joi.string().trim().max(500).allow(null, '')
}).unknown(true);

const highRiskEntrySchema = Joi.object({
  personal: Joi.boolean(),
  family: Joi.boolean(),
  remarks: Joi.string().trim().max(500).allow(null, '')
}).unknown(true);

const medicalInfoSchema = Joi.object({
  drug_food_allergies: Joi.array().items(Joi.string().trim().max(150)),
  medications_supplements: Joi.array().items(Joi.string().trim().max(150)),
  illness_history: Joi.array().items(illnessRowSchema),
  high_risk_behavior: Joi.object({
    smoking: highRiskEntrySchema,
    alcohol_intake: highRiskEntrySchema
  }).unknown(true)
}).unknown(true).allow(null);

// ── Patient validation schema ───────────────────────────────────────────────
// Trims whitespace, enforces max lengths, rejects unexpected keys, and
// sanitizes HTML from free-text fields before returning.
const patientSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).required(),
  last_name: Joi.string().trim().min(1).max(100).required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  age: Joi.number().integer().min(0).max(150).allow(null, ''),
  sex: Joi.string().valid('Male', 'Female', 'Other').allow(null, ''),
  address: Joi.string().trim().max(500).allow(null, ''),
  contact_number: Joi.string().trim().max(30).allow(null, ''),
  emergency_contact: Joi.string().trim().max(30).allow(null, ''),
  allergies: Joi.string().trim().max(1000).allow(null, ''),
  personal_info: personalInfoSchema,
  medical_info: medicalInfoSchema
}).unknown(false);

// Fields that may contain HTML-like user input and need sanitization
const PATIENT_SANITIZE_FIELDS = ['address', 'allergies', 'emergency_contact'];
// Nested JSON fields that need deep (recursive) sanitization
const PATIENT_DEEP_SANITIZE_FIELDS = ['personal_info', 'medical_info'];

// ── Consultation validation schema ──────────────────────────────────────────
const consultationSchema = Joi.object({
  patient_id: Joi.number().integer().positive().required(),
  doctor_id: Joi.number().integer().positive().allow(null, ''),
  visit_date: Joi.date(),
  raw_notes: Joi.string().trim().max(5000).allow(null, ''),
  structured_notes: Joi.string().trim().max(10000).allow(null, ''),
  chief_complaint: Joi.string().trim().max(500).allow(null, ''),
  diagnosis: Joi.string().trim().max(500).allow(null, ''),
  prescription: Joi.string().trim().max(1000).allow(null, ''),
  subjective: Joi.string().trim().max(2000).allow(null, ''),
  objective: Joi.string().trim().max(2000).allow(null, ''),
  assessment: Joi.string().trim().max(2000).allow(null, ''),
  plan: Joi.string().trim().max(2000).allow(null, ''),
  delivery_location: Joi.string().trim().valid('jlmc').allow(null, ''),
  ai_summary_used: Joi.boolean()
}).unknown(false);

const CONSULTATION_SANITIZE_FIELDS = ['raw_notes', 'structured_notes', 'chief_complaint', 'diagnosis', 'prescription', 'subjective', 'objective', 'assessment', 'plan', 'delivery_location'];

// ── Consultation Transaction validation schema (PhilHealth packages + vitamins + recs) ──
const transactionPackageSchema = Joi.object({
  code: Joi.string().trim().max(30).required(),
  label: Joi.string().trim().max(150).required(),
  amount: Joi.number().min(0).required()
}).unknown(false);

const transactionVitaminSchema = Joi.object({
  id: Joi.string().trim().max(100).required(),
  label: Joi.string().trim().max(150).required(),
  price: Joi.number().min(0).required(),
  custom: Joi.boolean().default(false)
}).unknown(false);

const consultationTransactionSchema = Joi.object({
  patient_id: Joi.number().integer().positive().required(),
  consultation_id: Joi.number().integer().positive().allow(null, ''),
  transaction_date: Joi.date(),
  packages: Joi.array().items(transactionPackageSchema).default([]),
  vitamins: Joi.array().items(transactionVitaminSchema).default([]),
  recommendations: Joi.string().trim().max(3000).allow(null, ''),
  total_amount: Joi.number().min(0).default(0),
  philhealth_total: Joi.number().min(0).default(0)
}).unknown(false);

const TRANSACTION_SANITIZE_FIELDS = ['recommendations'];

function validatePatient(data) {
  const result = patientSchema.validate(data);
  if (result.error) return result;
  // Strip dangerous HTML after Joi passes
  result.value = sanitizeObject(result.value, PATIENT_SANITIZE_FIELDS);
  for (const field of PATIENT_DEEP_SANITIZE_FIELDS) {
    if (result.value[field] !== undefined) {
      result.value[field] = sanitizeDeep(result.value[field]);
    }
  }
  return result;
}

function validateConsultation(data) {
  const result = consultationSchema.validate(data);
  if (result.error) return result;
  result.value = sanitizeObject(result.value, CONSULTATION_SANITIZE_FIELDS);
  return result;
}

function validateConsultationTransaction(data) {
  const result = consultationTransactionSchema.validate(data);
  if (result.error) return result;
  result.value = sanitizeObject(result.value, TRANSACTION_SANITIZE_FIELDS);
  return result;
}


// ── Admission, delivery & discharge ─────────────────────────────────────────
const shortText = (max) => Joi.string().trim().max(max).allow(null, '');
const optionCode = Joi.string().trim().max(60);

const admissionSchema = Joi.object({
  patient_id: Joi.number().integer().positive().required(),
  pregnancy_id: Joi.number().integer().positive().allow(null, ''),
  admitted_at: Joi.date(),
  chief_complaint: shortText(1000),
  admitting_diagnosis: shortText(1000),
  bp: shortText(20),
  pulse: Joi.number().integer().min(20).max(250).allow(null, ''),
  resp_rate: Joi.number().integer().min(5).max(80).allow(null, ''),
  temperature: Joi.number().min(30).max(45).allow(null, ''),
  labor_notes: shortText(3000),
  risk_flags: Joi.array().items(optionCode).max(40).default([]),
  consent_signed: Joi.boolean(),
  consent_by: shortText(150),
  philhealth_package: shortText(60),
  notes: shortText(3000),
  bed_number: Joi.number().integer().min(1).max(50).allow(null, '')
}).unknown(false);

const admissionUpdateSchema = admissionSchema.fork(['patient_id'], (f) => f.forbidden());

const newbornSchema = Joi.object({
  sex: Joi.string().valid('Male', 'Female', 'Other').allow(null, ''),
  weight_grams: Joi.number().integer().min(200).max(8000).allow(null, ''),
  apgar_1: Joi.number().integer().min(0).max(10).allow(null, ''),
  apgar_5: Joi.number().integer().min(0).max(10).allow(null, ''),
  essential_care: Joi.array().items(optionCode).max(30).default([]),
  notes: shortText(2000)
}).unknown(false);

const deliverySchema = Joi.object({
  delivered_at: Joi.date(),
  delivery_type: shortText(60),
  attendant: shortText(300),
  complications: shortText(2000),
  newborns: Joi.array().items(newbornSchema).max(6).default([])
}).unknown(false);

const admissionItemSchema = Joi.object({
  option_id: Joi.number().integer().positive().allow(null, ''),
  label: Joi.string().trim().max(150),
  unit_price: Joi.number().min(0).max(1000000),
  quantity: Joi.number().greater(0).max(1000).default(1),
  given_at: Joi.date()
}).or('option_id', 'label').unknown(false);

const dischargeSchema = Joi.object({
  disposition: Joi.string().trim().max(60).required(),
  discharged_at: Joi.date(),
  final_diagnosis: shortText(1000),
  instructions: shortText(3000),
  override_reason: shortText(500)
}).unknown(false);

const referralSchema = Joi.object({
  facility: Joi.string().trim().min(1).max(200).required(),
  reason: shortText(2000),
  referred_at: Joi.date(),
  transport: shortText(100),
  notes: shortText(2000)
}).unknown(false);

const OPTION_GROUPS = ['discharge_reason', 'delivery_type', 'risk_flag', 'newborn_care', 'package', 'item'];

const clinicOptionSchema = Joi.object({
  option_group: Joi.string().valid(...OPTION_GROUPS).required(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_]+$/).max(60),
  label: Joi.string().trim().min(1).max(150).required(),
  price: Joi.number().min(0).max(1000000).allow(null, ''),
  category: shortText(40),
  active: Joi.boolean(),
  sort_order: Joi.number().integer().min(0).max(10000)
}).unknown(false);

const clinicOptionUpdateSchema = clinicOptionSchema.fork(['option_group', 'label'], (f) => f.optional());

const SETTING_RULES = {
  min_stay_hours: Joi.number().integer().min(0).max(240).required(),
  followup_offsets_hours: Joi.string().trim().pattern(/^\d+(\s*,\s*\d+){0,5}$/).max(40).required(),
  require_consent: Joi.boolean().required(),
  ward_name: Joi.string().trim().min(1).max(40).required(),
  ward_beds: Joi.number().integer().min(1).max(50).required(),
  bed_price_per_night: Joi.alternatives(Joi.number().min(0).max(100000), Joi.string().valid('')).required()
};

const ADMISSION_TEXT = ['chief_complaint', 'admitting_diagnosis', 'labor_notes', 'consent_by', 'notes', 'bp', 'philhealth_package'];

function runValidation(schema, data, sanitizeFields = []) {
  const result = schema.validate(data);
  if (result.error) return result;
  result.value = sanitizeObject(result.value, sanitizeFields);
  return result;
}

function validateAdmission(data) { return runValidation(admissionSchema, data, ADMISSION_TEXT); }
function validateAdmissionUpdate(data) { return runValidation(admissionUpdateSchema, data, ADMISSION_TEXT); }
function validateDelivery(data) {
  const result = runValidation(deliverySchema, data, ['delivery_type', 'attendant', 'complications']);
  if (!result.error) result.value.newborns = result.value.newborns.map((n) => sanitizeObject(n, ['notes']));
  return result;
}
function validateAdmissionItem(data) { return runValidation(admissionItemSchema, data, ['label']); }
function validateDischarge(data) { return runValidation(dischargeSchema, data, ['disposition', 'final_diagnosis', 'instructions', 'override_reason']); }
function validateReferral(data) { return runValidation(referralSchema, data, ['facility', 'reason', 'transport', 'notes']); }
function validateClinicOption(data) { return runValidation(clinicOptionSchema, data, ['label', 'category']); }
function validateClinicOptionUpdate(data) { return runValidation(clinicOptionUpdateSchema, data, ['label', 'category']); }
function validateSetting(key, value) {
  const rule = SETTING_RULES[key];
  if (!rule) return { error: new Error(`Unknown setting: ${key}`) };
  return rule.validate(value);
}

module.exports = {
  validatePatient,
  validateConsultation,
  validateConsultationTransaction,
  validateAdmission,
  validateAdmissionUpdate,
  validateDelivery,
  validateAdmissionItem,
  validateDischarge,
  validateReferral,
  validateClinicOption,
  validateClinicOptionUpdate,
  validateSetting,
  OPTION_GROUPS,
  SETTING_RULES
};