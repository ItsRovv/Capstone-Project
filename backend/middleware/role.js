/**
 * Role-based access control middleware.
 * Use after `auth`:
 *   router.delete('/users/:id', auth, requireRole('admin'), handler)
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access token required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: `Forbidden: requires one of [${allowed.join(', ')}]` });
    }
    next();
  };
}

// Clinic staff roles.
const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'staff'];

/**
 * Allow any clinic staff member (admin/doctor/nurse/staff).
 * Use on routes that expose patient data or clinic-wide management.
 */
const requireStaff = requireRole(...STAFF_ROLES);

/**
 * Staff, plus the admission midwife who may only look things up (GET/HEAD).
 * Use on routes the admission screens read from (patients, transactions, options).
 */
const requireStaffOrMidwifeRead = (req, res, next) => {
  if (req.user?.role === 'midwife' && ['GET', 'HEAD'].includes(req.method)) return next();
  return requireStaff(req, res, next);
};

// Clinical roles: whoever is on duty (midwife/nurse, doctor) or the administrator.
// Front-desk staff can view admissions but not create or change them.
const CLINICAL_ROLES = ['admin', 'doctor', 'nurse', 'midwife'];
const requireClinical = requireRole(...CLINICAL_ROLES);

// Everyone who may open the Admission and Discharge screens.
const ADMISSION_ROLES = [...STAFF_ROLES, 'midwife'];
const requireAdmissionAccess = requireRole(...ADMISSION_ROLES);

module.exports = requireRole;
module.exports.requireStaff = requireStaff;
module.exports.requireStaffOrMidwifeRead = requireStaffOrMidwifeRead;
module.exports.requireClinical = requireClinical;
module.exports.requireAdmissionAccess = requireAdmissionAccess;
module.exports.CLINICAL_ROLES = CLINICAL_ROLES;
module.exports.STAFF_ROLES = STAFF_ROLES;
module.exports.ADMISSION_ROLES = ADMISSION_ROLES;
