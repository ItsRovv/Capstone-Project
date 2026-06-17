const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { extractToken } = require('../middleware/auth');

// Token lifetime — 8 hours is a reasonable session for a clinic workday
const TOKEN_EXPIRY = '8h';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 h in milliseconds
const IS_PROD = process.env.NODE_ENV === 'production';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Set the auth token as an httpOnly cookie so it is inaccessible to JavaScript
 * (prevents XSS from stealing credentials).
 *
 * Flags used:
 *  httpOnly  — JS cannot read this cookie (mitigates XSS token theft)
 *  secure    — only sent over HTTPS (in production)
 *  sameSite  — 'strict' prevents the cookie from being sent on cross-site requests
 *              (mitigates CSRF attacks)
 *  path=/    — available to every API route
 */
function setAuthCookie(res, token) {
  res.cookie('lc_auth', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/'
  });
}

function clearAuthCookie(res) {
  res.clearCookie('lc_auth', { httpOnly: true, secure: IS_PROD, sameSite: 'strict', path: '/' });
}

/**
 * Validate email format (basic RFC-5322-like check).
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

/**
 * Enforce a minimum password policy:
 *  - At least 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - At least one special character
 */
function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Max failed attempts before lockout; lockout duration in minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const user = await User.findByEmail(email);
    // Always run a compare to prevent timing-based user enumeration
    if (!user) {
      await User.dummyCompare();
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const unlockAt = new Date(user.locked_until).toISOString();
      return res.status(423).json({
        message: `Account is temporarily locked after too many failed attempts. Try again after ${unlockAt}.`
      });
    }

    const ok = await User.comparePassword(password, user.password_hash);
    if (!ok) {
      await User.incrementFailedLogin(user.id, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Successful login — reset lockout counter and issue token via httpOnly cookie
    await User.resetFailedLogin(user.id);
    const token = signToken(user);
    setAuthCookie(res, token);
    // Also return the token in the body so non-browser API clients can use it
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/register
 * Body: { name, email, password, role? }
 *
 * First registered user (when the DB is empty) is always 'admin' and requires
 * no authentication.
 *
 * After that, this endpoint requires an authenticated ADMIN token.
 * The caller's JWT is automatically sent by the frontend's axios interceptor,
 * so the admin can POST here while logged in to create additional accounts.
 */
async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'
      });
    }

    const userCount = await User.count();

    if (userCount > 0) {
      // After first user — require an admin JWT.
      // Read the token from the httpOnly cookie OR the Authorization header so
      // a logged-in admin (whose token lives in a cookie the browser can't expose
      // to JS) can create accounts, while API clients can still use Bearer tokens.
      const token = extractToken(req);
      if (!token) {
        return res.status(403).json({ message: 'Registration is restricted. An admin must create new accounts.' });
      }
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return res.status(403).json({ message: 'Invalid or expired token. Admin authentication required.' });
      }
      if (decoded.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can register new users.' });
      }
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    // First user is admin; subsequent users default to 'staff' unless role specified
    const finalRole = userCount === 0 ? 'admin' : (role || 'staff');
    if (!['admin', 'doctor', 'staff'].includes(finalRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const id = await User.create({ name, email, password, role: finalRole });
    const user = await User.findById(id);
    const responseToken = signToken(user);
    // If this is the first-user setup (no existing admin session), set the cookie now
    if (userCount === 0) setAuthCookie(res, responseToken);
    return res.status(201).json({ token: responseToken, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/auth/users/:id
 * Admin only — permanently delete a user account.
 */
async function deleteUser(req, res, next) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    const deleted = await User.delete(targetId);
    if (!deleted) return res.status(404).json({ message: 'User not found' });
    return res.json({ message: 'User deleted successfully' });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/users
 * Admin only — list all users (without password hashes).
 */
async function listUsers(req, res, next) {
  try {
    const users = await User.findAll();
    return res.json(users.map(publicUser));
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/auth/users/:id
 * Admin only — update a user's name, email, or role.
 */
async function updateUser(req, res, next) {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { name, email, role, password } = req.body || {};
    if (!name || !email || !role) {
      return res.status(400).json({ message: 'Name, email, and role are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!['admin', 'doctor', 'staff'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (password !== undefined && password !== '') {
      if (!isStrongPassword(password)) {
        return res.status(400).json({
          message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
        });
      }
    }
    const updated = await User.update(targetId, { name, email, role, ...(password ? { password } : {}) });
    if (!updated) return res.status(404).json({ message: 'User not found' });
    const user = await User.findById(targetId);
    return res.json({ message: 'User updated successfully', user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 * Clears the httpOnly auth cookie (server-side logout).
 */
function logout(req, res) {
  clearAuthCookie(res);
  return res.json({ message: 'Logged out successfully' });
}

module.exports = { login, register, me, logout, listUsers, updateUser, deleteUser };
