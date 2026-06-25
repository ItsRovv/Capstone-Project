const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const { validatePatient } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// Clinic staff only.
router.use(auth, requireStaff);

// Get all patients (with optional search + pagination)
// Returns { data, total, page, limit }. Pass ?page= & ?limit= to paginate.
router.get('/', async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Patient.findAll(searchTerm, { limit, offset }),
      Patient.count(searchTerm)
    ]);

    res.json({ data, total, page, limit });
  } catch (err) {
    routeError(res, err);
  }
});

// Get active patients (patients with ongoing pregnancies)
router.get('/active', async (req, res) => {
  try {
    const active = await Patient.findActive();
    res.json(active);
  } catch (err) {
    routeError(res, err);
  }
});

// Get patient by ID
router.get('/:id', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json(patient);
  } catch (err) {
    routeError(res, err);
  }
});

// Create new patient
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error } = validatePatient(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const patientId = await Patient.create(req.body);
    res.status(201).json({ id: patientId, message: 'Patient created successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update patient by ID
router.put('/:id', async (req, res) => {
  try {
    // Validate input
    const { error } = validatePatient(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const updated = await Patient.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete patient by ID (restricted — deleting medical records is sensitive)
router.delete('/:id', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const deleted = await Patient.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;