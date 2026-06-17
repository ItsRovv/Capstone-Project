const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Extract a JWT from the request.
 * Priority:
 *  1. httpOnly cookie `lc_auth` (set by the server on login — not accessible to JS)
 *  2. Authorization header `Bearer <token>` (API clients, Postman, tests)
 */
function extractToken(req) {
  if (req.cookies && req.cookies.lc_auth) return req.cookies.lc_auth;
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.split(' ')[1];
}

const authenticateToken = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

module.exports = authenticateToken;
// Exported so the auth controller can read the same cookie/header token
// when gating self-service routes (e.g. admin-only user registration).
module.exports.extractToken = extractToken;