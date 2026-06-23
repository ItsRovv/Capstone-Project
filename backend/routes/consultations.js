const express = require('express');
const router = express.Router();
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const aiService = require('../services/aiService');
const { validateConsultation } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// Clinic staff only.
router.use(auth, requireStaff);

// Get all consultations for a patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const consultations = await Consultation.findByPatientId(req.params.patientId);
    res.json(consultations);
  } catch (err) {
    routeError(res, err);
  }
});

// Get consultation by ID
router.get('/:id', auth, async (req, res) => {
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

// Create new consultation
router.post('/', auth, async (req, res) => {
  try {
    // Validate input
    const { error } = validateConsultation(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Check if patient exists
    const patient = await Patient.findById(req.body.patient_id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const consultationId = await Consultation.create(req.body);
    res.status(201).json({ id: consultationId, message: 'Consultation created successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update consultation by ID
router.put('/:id', auth, async (req, res) => {
  try {
    // Validate input
    const { error } = validateConsultation(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const updated = await Consultation.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.json({ message: 'Consultation updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Summarize a consultation's raw notes with AI and persist the structured result
router.post('/:id/summarize', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    if (!consultation.raw_notes) {
      return res.status(400).json({ message: 'Consultation has no raw notes to summarize' });
    }

    const structured = await aiService.summarizeNote(consultation.raw_notes);

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
    const deleted = await Consultation.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Consultation not found' });
    }
    res.json({ message: 'Consultation deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;