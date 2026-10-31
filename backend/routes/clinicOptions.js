const express = require('express');
const router = express.Router();
const ClinicOption = require('../models/ClinicOption');
const Admission = require('../models/Admission');
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireAdmissionAccess } = require('../middleware/role');
const {
  validateClinicOption, validateClinicOptionUpdate, validateSetting, OPTION_GROUPS
} = require('../middleware/validation');
const { routeError } = require('../utils/routeError');

router.use(auth);

function audit(req, action, recordId, oldData, newData, tableName) {
  return AuditLog.create({
    userId: req.user?.id, action, tableName, recordId, oldData, newData, ipAddress: req.ip
  }).catch((e) => console.warn('[audit] failed:', e.message));
}

const bad = (res, error) => res.status(400).json({ message: error.details?.[0]?.message || error.message });

// These lists belong to the Admission and Discharge module itself. Everyone can still
// READ them (the module's forms need them), but they are not managed from Clinic
// Settings, so create/edit/hide is blocked here too.
const LOCKED_OPTION_GROUPS = ['discharge_reason', 'delivery_type', 'risk_flag', 'newborn_care'];
const lockedMessage = 'This list belongs to the Admission and Discharge module and cannot be changed from Clinic Settings.';

// Everyone on staff can read the lists (forms need them). Hidden choices are returned only
// when asked (?all=1) so old records can still show the wording they were saved with.
router.get('/options', requireAdmissionAccess, async (req, res) => {
  try {
    const { group } = req.query;
    if (group && !OPTION_GROUPS.includes(group)) return res.status(400).json({ message: 'Unknown list' });
    const includeInactive = req.query.all === '1';
    res.json(await ClinicOption.list({ group, includeInactive }));
  } catch (err) { routeError(res, err); }
});

router.post('/options', requireRole('admin'), async (req, res) => {
  try {
    const { error, value } = validateClinicOption(req.body);
    if (error) return bad(res, error);
    if (LOCKED_OPTION_GROUPS.includes(value.option_group)) {
      return res.status(403).json({ message: lockedMessage });
    }
    const id = await ClinicOption.create(value).catch((err) => {
      if (err.code === '23505') return null;
      throw err;
    });
    if (id === null) return res.status(409).json({ message: 'That choice already exists in this list.' });
    await audit(req, 'CREATE', id, undefined, value, 'clinic_options');
    res.status(201).json({ id, message: 'Added' });
  } catch (err) { routeError(res, err); }
});

router.put('/options/:id', requireRole('admin'), async (req, res) => {
  try {
    const { error, value } = validateClinicOptionUpdate(req.body);
    if (error) return bad(res, error);
    const old = await ClinicOption.findById(req.params.id);
    if (!old) return res.status(404).json({ message: 'Not found' });
    if (LOCKED_OPTION_GROUPS.includes(old.option_group)) {
      return res.status(403).json({ message: lockedMessage });
    }
    await ClinicOption.update(req.params.id, value);
    await audit(req, 'UPDATE', Number(req.params.id), old, value, 'clinic_options');
    res.json({ message: 'Saved' });
  } catch (err) { routeError(res, err); }
});

// "Delete" only hides the choice, so old records that used it stay readable.
router.delete('/options/:id', requireRole('admin'), async (req, res) => {
  try {
    const old = await ClinicOption.findById(req.params.id);
    if (!old) return res.status(404).json({ message: 'Not found' });
    if (LOCKED_OPTION_GROUPS.includes(old.option_group)) {
      return res.status(403).json({ message: lockedMessage });
    }
    await ClinicOption.deactivate(req.params.id);
    await audit(req, 'DELETE', Number(req.params.id), old, undefined, 'clinic_options');
    res.json({ message: 'Hidden from the lists' });
  } catch (err) { routeError(res, err); }
});

router.get('/settings', requireAdmissionAccess, async (req, res) => {
  try {
    res.json(await ClinicOption.getSettings());
  } catch (err) { routeError(res, err); }
});

router.put('/settings', requireRole('admin'), async (req, res) => {
  try {
    const entries = Object.entries(req.body || {});
    if (!entries.length) return res.status(400).json({ message: 'Nothing to save' });
    const clean = [];
    for (const [key, raw] of entries) {
      const { error, value } = validateSetting(key, raw);
      if (error) return bad(res, error);
      clean.push([key, value]);
    }
    const newBeds = clean.find(([key]) => key === 'ward_beds');
    if (newBeds) {
      const highest = await Admission.highestActiveBed();
      if (Number(newBeds[1]) < highest) {
        return res.status(409).json({ message: `Bed ${highest} is in use. Discharge or move that patient before reducing the number of beds.` });
      }
    }
    const old = await ClinicOption.getSettingsMap();
    for (const [key, value] of clean) await ClinicOption.setSetting(key, value);
    await audit(req, 'UPDATE', undefined, old, Object.fromEntries(clean), 'clinic_settings');
    res.json({ message: 'Settings saved' });
  } catch (err) { routeError(res, err); }
});

module.exports = router;
