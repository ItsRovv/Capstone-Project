const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { validateAppointment } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// Get all appointments (optionally filter by date)
router.get('/', auth, async (req, res) => {
  try {
    const date = req.query.date; // Expected format: YYYY-MM-DD
    const appointments = date
      ? await Appointment.findByDate(date)
      : await Appointment.findAll();
    res.json(appointments);
  } catch (err) {
    routeError(res, err);
  }
});

// Get appointment by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.json(appointment);
  } catch (err) {
    routeError(res, err);
  }
});

// Create new appointment
router.post('/', auth, async (req, res) => {
  try {
    // Validate input
    const { error } = validateAppointment(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Check if patient exists
    const patient = await Patient.findById(req.body.patient_id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const appointmentId = await Appointment.create(req.body);
    res.status(201).json({ id: appointmentId, message: 'Appointment created successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update appointment by ID
router.put('/:id', auth, async (req, res) => {
  try {
    // Validate input
    const { error } = validateAppointment(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const updated = await Appointment.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.json({ message: 'Appointment updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete appointment by ID (restricted — only admin or doctor may remove appointments)
router.delete('/:id', auth, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const deleted = await Appointment.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    res.json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;