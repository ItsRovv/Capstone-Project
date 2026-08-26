const express = require('express');
const router = express.Router({ mergeParams: true });
const Pregnancy = require('../models/Pregnancy');
const AuditLog = require('../models/AuditLog');
const { requireStaff } = require('../middleware/role');
const auth = require('../middleware/auth');
const { routeError } = require('../utils/routeError');
const { syncPregnancyToTracking } = require('../services/pregnancySyncService');

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
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'pregnancies',
      recordId: pregnancyId,
      newData: { patient_id: patientId, ...req.body },
      ipAddress: req.ip
    });
    // Auto-sync to monthly tracking form (best-effort, non-blocking)
    const newPreg = await Pregnancy.findById(pregnancyId);
    if (newPreg) {
      syncPregnancyToTracking(newPreg).catch(() => {});
    }
    res.status(201).json({ id: pregnancyId, message: 'Pregnancy record created' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update a pregnancy record
router.put('/:id', async (req, res) => {
  try {
    const oldPregnancy = await Pregnancy.findById(req.params.id);
    // Merge with the existing record so partial updates (e.g. status-only)
    // don't null out fields the caller didn't send.
    const merged = { ...(oldPregnancy || {}), ...req.body };
    // Recompute BMI if weight/height changed in this request.
    if ('baseline_weight_kg' in req.body || 'baseline_height_cm' in req.body) {
      delete merged.baseline_bmi;
    }
    const updated = await Pregnancy.update(req.params.id, merged);
    if (!updated) {
      return res.status(404).json({ message: 'Pregnancy record not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'UPDATE',
      tableName: 'pregnancies',
      recordId: req.params.id,
      oldData: oldPregnancy || undefined,
      newData: req.body,
      ipAddress: req.ip
    });
    // Auto-sync to monthly tracking form (best-effort, non-blocking)
    const updatedPreg = await Pregnancy.findById(req.params.id);
    if (updatedPreg) {
      syncPregnancyToTracking(updatedPreg).catch(() => {});
    }
    res.json({ message: 'Pregnancy record updated' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete a pregnancy record
router.delete('/:id', async (req, res) => {
  try {
    const oldPregnancy = await Pregnancy.findById(req.params.id);
    const deleted = await Pregnancy.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Pregnancy record not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      tableName: 'pregnancies',
      recordId: req.params.id,
      oldData: oldPregnancy || undefined,
      ipAddress: req.ip
    });
    res.json({ message: 'Pregnancy record deleted' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
