const express = require('express');
const router = express.Router();
const Queue = require('../models/Queue');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaff } = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// ── Helpers ────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── Routes ─────────────────────────────────────────────────────────────────

// All queue routes require authentication.
router.use(auth);

// GET /api/queue/today — list today's queue (all staff & doctors)
router.get('/today', requireStaff, async (req, res) => {
  try {
    const rows = await Queue.listToday();
    res.json(rows);
  } catch (err) {
    routeError(res, err);
  }
});

// GET /api/queue/today/serving — currently serving patient (doctor/admin)
router.get('/today/serving', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const entry = await Queue.findServingToday();
    res.json(entry);
  } catch (err) {
    routeError(res, err);
  }
});

// GET /api/queue/today/count — count waiting patients today
router.get('/today/count', requireStaff, async (req, res) => {
  try {
    const count = await Queue.countWaitingToday();
    res.json({ count });
  } catch (err) {
    routeError(res, err);
  }
});

// POST /api/queue — add a patient to today's queue (staff, nurse, admin only)
router.post('/', requireRole('admin', 'nurse', 'staff'), async (req, res) => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) {
      return res.status(400).json({ message: 'patient_id is required' });
    }
    const result = await Queue.add(patient_id);
    res.status(201).json(result);
  } catch (err) {
    routeError(res, err);
  }
});

// PATCH /api/queue/:id/status — update queue status (doctor, admin)
router.patch('/:id/status', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['waiting', 'serving', 'done', 'skipped'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Use one of: ${valid.join(', ')}` });
    }
    const entry = await Queue.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }
    const success = await Queue.updateStatus(req.params.id, status, req.user.id);
    res.json({ success, status });
  } catch (err) {
    routeError(res, err);
  }
});

// DELETE /api/queue/:id — remove from queue (staff, nurse, admin)
router.delete('/:id', requireRole('admin', 'nurse', 'staff'), async (req, res) => {
  try {
    const entry = await Queue.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }
    const success = await Queue.delete(req.params.id);
    res.json({ success });
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;
