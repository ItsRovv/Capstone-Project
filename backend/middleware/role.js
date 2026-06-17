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

module.exports = requireRole;
