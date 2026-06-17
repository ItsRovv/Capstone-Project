const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const auth = require('../middleware/auth');
const { routeError } = require('../utils/routeError');

// Get all reports
router.get('/', auth, async (req, res) => {
  try {
    const reports = await Report.findByDateRange('2000-01-01', new Date().toISOString().split('T')[0]); // Simple way to get all
    res.json(reports);
  } catch (err) {
    routeError(res, err);
  }
});

// Get report by date
router.get('/:date', auth, async (req, res) => {
  try {
    const report = await Report.findByDateAndType(req.params.date);
    if (!report) {
      return res.status(404).json({ message: 'Report not found for this date' });
    }
    res.json(report);
  } catch (err) {
    routeError(res, err);
  }
});

module.exports = router;