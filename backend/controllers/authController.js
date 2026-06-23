const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { extractToken } = require('../middleware/auth');
const { sendMail, isConfigured: isMailConfigured } = require('../utils/mailer');
const {
  generateOtp,
  hashOtp,
  compareOtp,
  otpExpiry,
  buildOtpEmail,
  OTP_MAX_ATTEMPTS
} = require('../utils/otp');

// Token lifetime — 8 hours is a reasonable session for a clinic workday
const TOKEN_EXPIRY = '8h';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 h in milliseconds
const IS_PROD = process.env.NODE_ENV === 'production';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Staff roles that an admin may assign when creating/updating staff accounts.
const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'staff'];

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
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: Boolean(user.email_verified)
  };
}

// Max failed attempts before lockout; lockout duration in minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

/**
 * Generate an OTP, persist its hash on the user, and email the plaintext code.
 * Returns true if the email was actually sent.
 * @param {object} user - user row (must have id, email, name)
 * @param {'password_reset'|'email_verify'} purpose
 */
async function issueOtp(user, purpose) {
  const code = generateOtp();
  const hash = await hashOtp(code);
  await User.setOtp(user.id, { hash, expiresAt: otpExpiry(), purpose });

  const { subject, text, html } = buildOtpEmail(purpose, code, user.name);
  let sent = false;
  try {
    sent = await sendMail({ to: user.email, subject, text, html });
  } catch (err) {
    // A mail-transport failure must not break account creation / reset requests.
    // The OTP is stored; the user can request a new one once email is fixed.
    console.error('[auth] Failed to send OTP email:', err.message);
  }

  // Dev fallback: if the email wasn't actually sent (SMTP not set up or failed),
  // print the code to the server console so the flow is testable locally.
  // Never do this in production.
  if (!sent && process.env.NODE_ENV !== 'production') {
    console.log(
      `\n[auth][DEV] OTP for ${user.email} (${purpose}): ${code}` +
        `  — expires in ${require('../utils/otp').OTP_EXPIRY_MINUTES} min\n`
    );
  }

  return sent;
}

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

    // OAuth-only accounts can't log in with password
    if (!user.password_hash) {
      return res.status(401).json({
        message: 'This account uses social login. Please sign in with Google or Apple.'
      });
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

    // Block login until the account's email has been verified via OTP.
    if (!user.email_verified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Your email is not verified yet. Please verify your account using the code we emailed you.'
      });
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

    // First user is admin; subsequent users default to 'staff' unless role specified.
    const finalRole = userCount === 0 ? 'admin' : (role || 'staff');
    if (!STAFF_ROLES.includes(finalRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // The very first account (bootstrap admin) is auto-verified so setup is never
    // blocked. Likewise, if email/SMTP isn't configured we auto-verify to avoid
    // locking accounts out. Otherwise the new user must verify via an emailed OTP.
    const isFirstUser = userCount === 0;
    const autoVerify = isFirstUser || !isMailConfigured();

    const id = await User.create({ name, email, password, role: finalRole, email_verified: autoVerify });
    const user = await User.findById(id);

    if (isFirstUser) {
      // Bootstrap admin logs in immediately.
      const responseToken = signToken(user);
      setAuthCookie(res, responseToken);
      return res.status(201).json({ token: responseToken, user: publicUser(user) });
    }

    // Admin-created account: send a verification OTP to the new user's email.
    let emailSent = false;
    if (!autoVerify) {
      emailSent = await issueOtp(user, 'email_verify');
    }

    return res.status(201).json({
      user: publicUser(user),
      emailVerificationSent: emailSent,
      // When SMTP is off the account is auto-verified and can log in right away.
      requiresVerification: !autoVerify
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Generates an OTP and emails it. Always returns a generic success response so
 * the endpoint cannot be used to enumerate which emails have accounts.
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    const user = await User.findByEmail(email);
    if (user) {
      await issueOtp(user, 'password_reset');
    }

    // Generic response regardless of whether the account exists.
    return res.json({
      message: 'If an account exists for that email, a reset code has been sent.'
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { email, otp, newPassword }
 *
 * Verifies the OTP (purpose=password_reset) and sets a new password.
 */
async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'
      });
    }

    const user = await User.findByEmail(email);
    const valid = await verifyUserOtp(user, otp, 'password_reset');
    if (!valid.ok) {
      return res.status(valid.status).json({ message: valid.message });
    }

    await User.setPassword(user.id, newPassword);
    return res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/verify-email
 * Body: { email, otp }
 *
 * Verifies the OTP (purpose=email_verify) and activates the account.
 */
async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const user = await User.findByEmail(email);
    if (user && user.email_verified) {
      return res.json({ message: 'This account is already verified. You can sign in.' });
    }

    const valid = await verifyUserOtp(user, otp, 'email_verify');
    if (!valid.ok) {
      return res.status(valid.status).json({ message: valid.message });
    }

    await User.markEmailVerified(user.id);
    return res.json({ message: 'Email verified. You can now sign in.' });
  } catch (err) {
    return next(err);
  }
}

/**
 * Shared OTP verification logic. Returns { ok, status?, message? }.
 * On too many failed attempts the OTP is cleared and must be re-requested.
 */
async function verifyUserOtp(user, otp, purpose) {
  // Use a constant-ish failure message to avoid leaking which step failed.
  const invalid = { ok: false, status: 400, message: 'Invalid or expired code. Please request a new one.' };

  if (!user || !user.otp_code_hash || user.otp_purpose !== purpose) {
    return invalid;
  }
  if (!user.otp_expires_at || new Date(user.otp_expires_at) < new Date()) {
    await User.clearOtp(user.id);
    return invalid;
  }
  if (user.otp_attempts >= OTP_MAX_ATTEMPTS) {
    await User.clearOtp(user.id);
    return { ok: false, status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
  }

  const match = await compareOtp(otp, user.otp_code_hash);
  if (!match) {
    const attempts = await User.incrementOtpAttempts(user.id);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await User.clearOtp(user.id);
      return { ok: false, status: 429, message: 'Too many incorrect attempts. Please request a new code.' };
    }
    return invalid;
  }

  return { ok: true };
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
    if (!STAFF_ROLES.includes(role)) {
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

/**
 * OAuth callback — called by Passport after successful Google/Apple authentication.
 * Issues an httpOnly JWT cookie and redirects to the frontend dashboard.
 */
function oauthCallback(req, res) {
  const user = req.user;
  if (!user) {
    const redirect = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=oauth_failed`;
    return res.redirect(redirect);
  }

  const token = signToken(user);
  setAuthCookie(res, token);

  // Preserve any intended destination in query param (e.g. ?from=/reports)
  const from = req.query.state || '/';
  const redirect = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${from}`;
  res.redirect(redirect);
}

module.exports = {
  login,
  register,
  me,
  logout,
  listUsers,
  updateUser,
  deleteUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  oauthCallback
};
