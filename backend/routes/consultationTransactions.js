const express = require('express');
const router = express.Router();
const ConsultationTransaction = require('../models/ConsultationTransaction');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const { validateConsultationTransaction } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaffOrMidwifeRead } = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// Clinic staff only (the admission midwife may view the statement of accounts, not change it).
router.use(auth, requireStaffOrMidwifeRead);

// Get all transactions
router.get('/', auth, async (req, res) => {
  try {
    const transactions = await ConsultationTransaction.findAll();
    res.json(transactions);
  } catch (err) {
    routeError(res, err);
  }
});

// Get all transactions for a patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const transactions = await ConsultationTransaction.findByPatientId(req.params.patientId);
    res.json(transactions);
  } catch (err) {
    routeError(res, err);
  }
});

// Get all transactions linked to a specific consultation visit
router.get('/consultation/:consultationId', auth, async (req, res) => {
  try {
    const transactions = await ConsultationTransaction.findByConsultationId(req.params.consultationId);
    res.json(transactions);
  } catch (err) {
    routeError(res, err);
  }
});

// Get transaction by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await ConsultationTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (err) {
    routeError(res, err);
  }
});

// Create new transaction
router.post('/', auth, async (req, res) => {
  try {
    const { error, value } = validateConsultationTransaction(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const patient = await Patient.findById(value.patient_id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const transactionId = await ConsultationTransaction.create({
      ...value,
      created_by: req.user?.id
    });
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'consultation_transactions',
      recordId: transactionId,
      newData: value,
      ipAddress: req.ip
    });
    res.status(201).json({ id: transactionId, message: 'Transaction recorded successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Update transaction by ID — admin/doctor only (staff create but cannot edit)
router.put('/:id', auth, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const { error, value } = validateConsultationTransaction(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const oldTransaction = await ConsultationTransaction.findById(req.params.id);
    const updated = await ConsultationTransaction.update(req.params.id, value);
    if (!updated) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'UPDATE',
      tableName: 'consultation_transactions',
      recordId: req.params.id,
      oldData: oldTransaction || undefined,
      newData: value,
      ipAddress: req.ip
    });
    res.json({ message: 'Transaction updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete transaction by ID (restricted)
router.delete('/:id', auth, requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const oldTransaction = await ConsultationTransaction.findById(req.params.id);
    const deleted = await ConsultationTransaction.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      tableName: 'consultation_transactions',
      recordId: req.params.id,
      oldData: oldTransaction || undefined,
      ipAddress: req.ip
    });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
