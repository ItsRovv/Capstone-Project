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

module.exports = {
  validatePatient,
  validateConsultation,
  validateConsultationTransaction
};