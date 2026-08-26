const express = require('express');
const router = express.Router();
const PregnancyTrackingForm = require('../models/PregnancyTrackingForm');
const Patient = require('../models/Patient');
const Pregnancy = require('../models/Pregnancy');
const AuditLog = require('../models/AuditLog');
const { requireStaff } = require('../middleware/role');
const auth = require('../middleware/auth');
const { routeError } = require('../utils/routeError');

router.use(auth, requireStaff);

const TOTAL_TRIMESTER_COLS = 15;

// Get active pregnancies pre-filled for the tracking form.
router.get('/active-pregnancies', async (req, res) => {
  try {
    const pregnancies = await Pregnancy.findActive();
    const rows = await Promise.all(
      pregnancies.map(async (pr) => {
        const patient = await Patient.findById(pr.patient_id);
        return {
          patient_id: pr.patient_id,
          name: patient ? `${patient.first_name} ${patient.last_name}` : '',
          address: patient?.address || '',
          age: patient?.age || null,
          cpNumber: patient?.contact_number || '',
          docSubmitted: false,
          edd: pr.edd || '',
          obIndex: pr.gp || '',
          trimester: Array(TOTAL_TRIMESTER_COLS).fill(''),
          deliveryDate: ''
        };
      })
    );
    res.json(rows);
  } catch (err) {
    routeError(res, err);
  }
});

// Get saved form by month/year.
router.get('/:monthYear', async (req, res) => {
  try {
    const form = await PregnancyTrackingForm.findByMonthYear(req.params.monthYear);
    if (!form) {
      return res.status(404).json({ message: 'Form not found' });
    }
    res.json(form);
  } catch (err) {
    routeError(res, err);
  }
});

// Create or update a tracking form.
router.post('/', async (req, res) => {
  try {
    const { monthYear, rows } = req.body;
    if (!monthYear || !Array.isArray(rows)) {
      return res.status(400).json({ message: 'monthYear and rows are required' });
    }

    const existing = await PregnancyTrackingForm.findByMonthYear(monthYear);
    if (existing) {
      await PregnancyTrackingForm.update(monthYear, rows);
      await AuditLog.create({
        userId: req.user?.id,
        action: 'UPDATE',
        tableName: 'pregnancy_tracking_forms',
        recordId: existing.id,
        newData: { monthYear, rows },
        ipAddress: req.ip
      });
      return res.json({ message: 'Form updated' });
    }

    const id = await PregnancyTrackingForm.create(monthYear, rows);
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'pregnancy_tracking_forms',
      recordId: id,
      newData: { monthYear, rows },
      ipAddress: req.ip
    });
    res.status(201).json({ id, message: 'Form created' });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
