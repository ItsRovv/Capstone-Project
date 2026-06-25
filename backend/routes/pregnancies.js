const express = require('express');
const router = express.Router({ mergeParams: true });
const Pregnancy = require('../models/Pregnancy');
const { requireStaff } = require('../middleware/role');
const auth = require('../middleware/auth');
const { routeError } = require('../utils/routeError');

router.use(auth, requireStaff);

// Get all pregnancies for a patient
router.get('/', async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const rows = await Pregnancy.findByPatientId(patientId);
    res.json(rows);
  } catch (err) {
    routeError(res, err);
  }
});

// Create a pregnancy record for a patient
router.post('/', async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const pregnancyId = await Pregnancy.create(patientId, req.body);
    res.status(201).json({ id: pregnancyId, message: 'Pregnancy record created' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update a pregnancy record
router.put('/:id', async (req, res) => {
  try {
    const updated = await Pregnancy.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Pregnancy record not found' });
    }
    res.json({ message: 'Pregnancy record updated' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete a pregnancy record
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Pregnancy.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Pregnancy record not found' });
    }
    res.json({ message: 'Pregnancy record deleted' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
