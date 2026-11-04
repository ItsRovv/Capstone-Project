const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const PatientImage = require('../models/PatientImage');
const Pregnancy = require('../models/Pregnancy');
const AuditLog = require('../models/AuditLog');
const { validatePatient } = require('../middleware/validation');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { requireStaffOrMidwifeRead } = require('../middleware/role');
const { routeError } = require('../utils/routeError');

// Clinic staff only (the admission midwife may look patients up, not change them).
router.use(auth, requireStaffOrMidwifeRead);

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
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'patients',
      recordId: patientId,
      newData: req.body,
      ipAddress: req.ip
    });
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

    const oldPatient = await Patient.findById(req.params.id);
    const updated = await Patient.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'UPDATE',
      tableName: 'patients',
      recordId: req.params.id,
      oldData: oldPatient || undefined,
      newData: req.body,
      ipAddress: req.ip
    });
    res.json({ message: 'Patient updated successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// Delete patient by ID (restricted — deleting medical records is sensitive)
router.delete('/:id', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const oldPatient = await Patient.findById(req.params.id);
    const deleted = await Patient.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      tableName: 'patients',
      recordId: req.params.id,
      oldData: oldPatient || undefined,
      ipAddress: req.ip
    });
    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    routeError(res, err);
  }
});

// ── Result images (ultrasound, lab printouts) ────────────────────────────
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i;

// Metadata list — no binary payload.
router.get('/:id/images', async (req, res) => {
  try {
    res.json(await PatientImage.listByPatient(req.params.id));
  } catch (err) { routeError(res, err); }
});

// Upload a photographed result. Body: { label, dataUrl }.
router.post('/:id/images', async (req, res) => {
  try {
    const label = String(req.body?.label || '').trim().slice(0, 150);
    const m = DATA_URL_RE.exec(String(req.body?.dataUrl || ''));
    if (!label) return res.status(400).json({ message: 'Please name the image (e.g. "Pelvic ultrasound")' });
    if (!m) return res.status(400).json({ message: 'Image must be PNG, JPG, WebP or GIF' });
    const data = Buffer.from(m[2], 'base64');
    if (!data.length) return res.status(400).json({ message: 'The image data is empty' });
    if (data.length > MAX_IMAGE_BYTES) return res.status(413).json({ message: 'Image too large — keep it under 12 MB' });

    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Tag the upload to the patient's ongoing pregnancy when she has one, so a
    // completed pregnancy's images stay archived with that pregnancy.
    const pregnancies = await Pregnancy.findByPatientId(req.params.id).catch(() => []);
    const ongoing = (pregnancies || []).find(
      (p) => !['delivered', 'discharged', 'completed'].includes(String(p.status || '').toLowerCase())
    );

    const id = await PatientImage.create({
      patient_id: req.params.id,
      pregnancy_id: ongoing?.id ?? null,
      label,
      mime: m[1].toLowerCase(),
      data,
      uploaded_by: req.user?.id
    });
    await AuditLog.create({
      userId: req.user?.id,
      action: 'CREATE',
      tableName: 'patient_images',
      recordId: id,
      newData: { patient_id: req.params.id, label },
      ipAddress: req.ip
    });
    res.status(201).json({ id, message: 'Image uploaded' });
  } catch (err) { routeError(res, err); }
});

// Serve the image binary for <img> tags (cookie auth handles permission).
router.get('/images/:imageId', async (req, res) => {
  try {
    const img = await PatientImage.findById(req.params.imageId);
    if (!img) return res.status(404).json({ message: 'Image not found' });
    res.set('Content-Type', img.mime);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(img.data);
  } catch (err) { routeError(res, err); }
});

// Delete an image — clinical roles only.
router.delete('/images/:imageId', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const img = await PatientImage.findById(req.params.imageId);
    if (!img) return res.status(404).json({ message: 'Image not found' });
    // Results of a completed pregnancy are archived — keep them for records.
    if (img.pregnancy_id) {
      const preg = await Pregnancy.findById(img.pregnancy_id).catch(() => null);
      if (preg && ['delivered', 'discharged', 'completed'].includes(String(preg.status || '').toLowerCase())) {
        return res.status(409).json({ message: 'This image belongs to a completed pregnancy and cannot be deleted' });
      }
    }
    await PatientImage.remove(req.params.imageId);
    await AuditLog.create({
      userId: req.user?.id,
      action: 'DELETE',
      tableName: 'patient_images',
      recordId: Number(req.params.imageId),
      oldData: { patient_id: img.patient_id, label: img.label },
      ipAddress: req.ip
    });
    res.json({ message: 'Image deleted' });
  } catch (err) { routeError(res, err); }
});

module.exports = router;