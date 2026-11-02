const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { extractToken } = require('./auth');

// Server-side enforcement of the per-account module access set in Manage Users.
// allowed_modules = { 'module-key': 'view' | 'edit' } — a missing key means hidden,
// NULL means unrestricted. 'view' allows reading only; 'edit' allows everything.
const PREFIXES = [
  ['/pregnancy-tracking', 'pregnancy-tracking'],
  ['/consultation-transactions', 'transactions'],
  ['/consultations', 'consultations'],
  ['/queue', 'consultations'],
  ['/admissions', 'admissions'],
  ['/monitoring', 'monitoring'],
  ['/patients', 'patients'],
  ['/reports', 'reports'],
  ['/summary', 'reports'],
  ['/clinic', 'clinic-settings']
];

// Reads that other modules depend on (patient pickers, clinic option lists) stay
// open even when the owning module is hidden; writes always need 'edit'.
const SHARED_READS = new Set(['patients', 'clinic-settings']);

const LABELS = {
  'pregnancy-tracking': 'Pregnancy Tracking', transactions: 'Transactions', consultations: 'Consultation',
  admissions: 'Admission and Discharge', monitoring: 'Monitoring', patients: 'Patients',
  reports: 'Reports', 'clinic-settings': 'Clinic Settings'
};

const TTL_MS = 10 * 1000;
const cache = new Map();

function clearCache(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(Number(userId));
}

async function loadModules(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.mods;
  const row = await User.findById(userId);
  let mods = row ? row.allowed_modules : null;
  if (typeof mods === 'string') { try { mods = JSON.parse(mods); } catch { mods = null; } }
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) mods = null;
  cache.set(userId, { mods, at: Date.now() });
  return mods;
}

function moduleFor(path) {
  const hit = PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

async function moduleAccess(req, res, next) {
  try {
    const key = moduleFor(req.path);
    if (!key) return next();

    const token = extractToken(req);
    if (!token) return next();
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return next(); }

    const mods = await loadModules(payload.id);
    if (!mods) return next();

    const readOnlyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (readOnlyMethod && SHARED_READS.has(key)) return next();

    const level = mods[key] === 'view' || mods[key] === 'edit' ? mods[key] : 'off';
    if (level === 'off') {
      return res.status(403).json({ message: `Your account does not have access to ${LABELS[key]}.` });
    }
    if (level === 'view' && !readOnlyMethod) {
      return res.status(403).json({ message: `Your account has read-only access to ${LABELS[key]}.` });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = moduleAccess;
module.exports.clearCache = clearCache;
module.exports.moduleFor = moduleFor;
