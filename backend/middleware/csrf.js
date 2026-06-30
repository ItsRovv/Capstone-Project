const crypto = require('crypto');

const CSRF_COOKIE = 'lc_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a random CSRF token (32 bytes hex = 64 chars).
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Set the CSRF token as a cookie (not httpOnly, so JS can read it).
 * SameSite=strict prevents cross-site cookie transmission.
 * Secure=true in production ensures HTTPS-only.
 */
function setCsrfCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours, matching JWT session
  });
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, { path: '/', sameSite: 'strict' });
}

/**
 * CSRF validation middleware.
 *
 * Only enforces CSRF for cookie-authenticated requests.
 * Bearer-token clients (API clients, Postman) are exempt because they don't
 * use cookies and therefore aren't vulnerable to CSRF.
 */
function csrfProtection(req, res, next) {
  // If the request uses a Bearer token instead of cookies, skip CSRF.
  const authHeader = req.headers.authorization || '';
  const usesBearer = authHeader.startsWith('Bearer ');
  if (usesBearer) {
    return next();
  }

  // Safe methods (GET, HEAD, OPTIONS) are read-only and don't need CSRF.
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token' });
  }

  next();
}

module.exports = {
  generateToken,
  setCsrfCookie,
  clearCsrfCookie,
  csrfProtection,
  CSRF_COOKIE,
  CSRF_HEADER
};
