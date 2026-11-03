const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Queue = require('../models/Queue');
const Admission = require('../models/Admission');
const AuditLog = require('../models/AuditLog');
const summaryService = require('../services/summaryService');
const { validateConsultation } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { routeError } = require('../utils/routeError');
const { ensurePregnancyForDelivery } = require('../services/admissionSync');

// Clinic staff only.
router.use(auth, requireStaff);

// Get today's consultation count (used by dashboard)
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [rows] = await db.query(
      'SELECT COUNT(*) AS total FROM consultations WHERE visit_date::date = ?',
      [today]
    );
    res.json({ count: parseInt(rows[0]?.total) || 0 });
  } catch (err) {
    routeError(res, err);
  }
});

// Get today's full consultations with patient names (doctor/admin only)
router.get('/today/detailed', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const consultations = await Consultation.findTodayDetailed();
    res.json(consultations);
  } catch (err) {
    routeError(res, err);
  }
});

// Get most recent consultations across all patients (used by dashboard)
router.get('/recent', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 20);
    const consultations = await Consultation.findRecent(limit);
    res.json(consultations);
  } catch (err) {
    routeError(res, err);
  }
});

// Get all consultations for a patient (doctor/admin only)
router.get('/patient/:patientId', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const consultations = await Consultation.findByPatientId(req.params.patientId);
    res.json(consultations);
  } catch (err) {
    routeError(res, err);
  }
});

// Get consultation by ID (doctor/admin only)
router.get('/:id', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.json(consultation);
  } catch (err) {
    routeError(res, err);
  }
});

// Create new consultation (doctor/admin only)
router.post('/', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    // Validate input
    const { error, value } = validateConsultation(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Check if patient exists
    const patient = await Patient.findById(value.patient_id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Post-natal care for a patient who is still admitted is handled in Admission
    // and Discharge; a post-natal consultation opens up again after discharge.
    if (value.consultation_type === 'postnatal') {
      const active = await Admission.findActiveByPatient(value.patient_id);
      if (active) {
        return res.status(409).json({
          code: 'PATIENT_ADMITTED',
          message: `${patient.first_name} ${patient.last_name} is currently admitted${active.bed_number ? ` (Bed ${active.bed_number})` : ''}. A post-natal consultation can be recorded after discharge.`
        });
      }
    }

    // Normalize delivery location to uppercase for consistent storage
    if (value.delivery_location) {
      value.delivery_location = value.delivery_location.toUpperCase();
    }

    // Auto-assign the current doctor
    const consultationId = await Consultation.create({
      ...value,
      doctor_id: req.user?.id ?? null
    });

    // If this patient has an active queue entry today, mark it as completed.
    const activeQueue = await Queue.findByPatientToday(value.patient_id);
    if (activeQueue) {
      await Queue.updateStatus(activeQueue.id, 'done', req.user?.id ?? null);
    }

    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'consultations',
      recordId: consultationId,
      newData: value,
      ipAddress: req.ip
    });

    // Best-effort: never fail a saved consultation because of this follow-up step.
    let pregnancyCreated = false;
    if (value.delivery_location) {
      try {
        const pregnancyId = await ensurePregnancyForDelivery(value.patient_id, value.delivery_location);
        if (pregnancyId) {
          pregnancyCreated = true;
          await AuditLog.create({
            userId: req.user?.id, action: 'CREATE', tableName: 'pregnancies', recordId: pregnancyId,
            newData: { patient_id: value.patient_id, source: 'consultation_delivery_location' }, ipAddress: req.ip
          });
        }
      } catch (e) {
        console.warn('[consultations] could not add pregnancy record:', e.message);
      }
    }

    // A prenatal visit writes itself into the patient's pregnancy tracking row.
    if (String(value.consultation_type || 'normal') === 'prenatal') {
      try {
        await require('./pregnancyTracking').recordPrenatalVisit(value.patient_id, value.visit_date);
      } catch (e) {
        console.warn('[consultations] could not update tracking form:', e.message);
      }
    }
    res.status(201).json({
      id: consultationId,
      pregnancy_created: pregnancyCreated,
      message: 'Consultation created successfully'
    });
  } catch (err) {
    routeError(res, err);
  }
});

// Update consultation by ID (doctor/admin only)
router.put('/:id', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    // Validate input
    const { error, value } = validateConsultation(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Normalize delivery location to uppercase for consistent storage
    if (value.delivery_location) {
      value.delivery_location = value.delivery_location.toUpperCase();
    }

    const oldConsultation = await Consultation.findById(req.params.id);
    if (!oldConsultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    // The type (normal / prenatal / postnatal) is fixed once the consultation is saved.
    value.consultation_type = oldConsultation.consultation_type || 'normal';
    // Fields the form didn't send keep their saved values (visit date, doctor, notes, …).
    for (const key of ['visit_date', 'doctor_id', 'raw_notes', 'structured_notes', 'chief_complaint', 'diagnosis', 'prescription', 'subjective', 'objective', 'assessment', 'plan', 'delivery_location', 'prenatal_data', 'postnatal_data', 'ai_summary_used']) {
      if (value[key] === undefined) value[key] = oldConsultation[key];
    }
    const updated = await Consultation.update(req.params.id, value);
    if (!updated) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'UPDATE',
      tableName: 'consultations',
      recordId: req.params.id,
      oldData: oldConsultation || undefined,
      newData: value,
      ipAddress: req.ip
    });
    res.json({ message: 'Consultation updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Summarize a consultation's raw notes with AI and persist the structured result (doctor/admin only)
router.post('/:id/summarize', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    if (!consultation.raw_notes) {
      return res.status(400).json({ message: 'Consultation has no raw notes to summarize' });
    }

    const structured = await summaryService.summarizeNote(consultation.raw_notes);

    // Persist the structured output and mark that AI was used.
    await Consultation.update(req.params.id, {
      ...consultation,
      structured_notes: JSON.stringify(structured),
      ai_summary_used: true
    });

    res.json({ success: true, structured });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete consultation by ID (restricted — medical records)
router.delete('/:id', auth, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const oldConsultation = await Consultation.findById(req.params.id);
    const deleted = await Consultation.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      tableName: 'consultations',
      recordId: req.params.id,
      oldData: oldConsultation || undefined,
      ipAddress: req.ip
    });
    res.json({ message: 'Consultation deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;