const Joi = require('joi');

// Patient validation schema
const patientSchema = Joi.object({
  first_name: Joi.string().min(1).max(100).required(),
  last_name: Joi.string().min(1).max(100).required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  age: Joi.number().integer().min(0).max(150).allow(null, ''),
  sex: Joi.string().valid('Male', 'Female', 'Other').allow(null, ''),
  address: Joi.string().allow(null, ''),
  contact_number: Joi.string().min(8).max(20).allow(null, ''),
  emergency_contact: Joi.string().allow(null, ''),
  allergies: Joi.string().allow(null, '')
});

// Consultation validation schema
const consultationSchema = Joi.object({
  patient_id: Joi.number().integer().positive().required(),
  doctor_id: Joi.number().integer().positive().allow(null, ''),
  visit_date: Joi.date(),
  raw_notes: Joi.string().allow(null, ''),
  structured_notes: Joi.string().allow(null, ''),
  chief_complaint: Joi.string().allow(null, ''),
  diagnosis: Joi.string().allow(null, ''),
  prescription: Joi.string().allow(null, ''),
  ai_summary_used: Joi.boolean()
});

function validatePatient(data) {
  return patientSchema.validate(data);
}

function validateConsultation(data) {
  return consultationSchema.validate(data);
}

module.exports = {
  validatePatient,
  validateConsultation
};