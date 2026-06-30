const Joi = require('joi');
const { sanitizeObject } = require('../utils/sanitizer');

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
  allergies: Joi.string().trim().max(1000).allow(null, '')
}).unknown(false);

// Fields that may contain HTML-like user input and need sanitization
const PATIENT_SANITIZE_FIELDS = ['address', 'allergies', 'emergency_contact'];

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
  ai_summary_used: Joi.boolean()
}).unknown(false);

const CONSULTATION_SANITIZE_FIELDS = ['raw_notes', 'structured_notes', 'chief_complaint', 'diagnosis', 'prescription'];

function validatePatient(data) {
  const result = patientSchema.validate(data);
  if (result.error) return result;
  // Strip dangerous HTML after Joi passes
  result.value = sanitizeObject(result.value, PATIENT_SANITIZE_FIELDS);
  return result;
}

function validateConsultation(data) {
  const result = consultationSchema.validate(data);
  if (result.error) return result;
  result.value = sanitizeObject(result.value, CONSULTATION_SANITIZE_FIELDS);
  return result;
}

module.exports = {
  validatePatient,
  validateConsultation
};