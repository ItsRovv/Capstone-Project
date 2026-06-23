const express = require('express');
const router = express.Router();
const passport = require('passport');
const {
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
} = require('../controllers/authController');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { otpLimiter } = require('../middleware/rateLimit');

router.post('/login', login);
router.post('/register', register);
router.get('/me', auth, me);
router.post('/logout', logout);

// OTP-based flows (rate-limited): password reset + email verification
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/reset-password', otpLimiter, resetPassword);
router.post('/verify-email', otpLimiter, verifyEmail);

// ── OAuth (Social Login) ───────────────────────────────────────────────────

// Google
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/oauth-failure' }),
  oauthCallback
);

// Generic OAuth failure handler — redirects to frontend login with error.
router.get('/oauth-failure', (req, res) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=oauth_denied`;
  res.redirect(url);
});

// Admin-only user management
router.get('/users', auth, requireRole('admin'), listUsers);
router.put('/users/:id', auth, requireRole('admin'), updateUser);
router.delete('/users/:id', auth, requireRole('admin'), deleteUser);

module.exports = router;
