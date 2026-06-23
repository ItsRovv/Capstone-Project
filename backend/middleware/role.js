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

module.exports = requireRole;
module.exports.requireStaff = requireStaff;
module.exports.STAFF_ROLES = STAFF_ROLES;
