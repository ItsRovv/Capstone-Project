const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Build the callback URL dynamically so it works in dev and production.
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Serialize / deserialize user for Passport session handling.
 * We only store the user id in the session cookie.
 */
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

/* ── Google OAuth 2.0 ─────────────────────────────────────────────────────── */

function configureGoogle() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientID || !clientSecret) {
    console.log('[passport] Google OAuth credentials not configured — skipping Google strategy.');
    return;
  }

  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
        scope: ['profile', 'email']
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || email.split('@')[0];
          const googleId = profile.id;

          if (!email) {
            return done(new Error('Google account did not provide an email'));
          }

          // 1. Try finding by Google ID first
          let user = await User.findByGoogleId(googleId);
          if (user) return done(null, user);

          // 2. Try finding by email and link the Google ID
          user = await User.findByEmail(email);
          if (user) {
            await User.linkGoogleId(user.id, googleId);
            user.google_id = googleId;
            return done(null, user);
          }

          // 3. Create a new user from the Google profile
          const id = await User.createFromOAuth({ name, email, googleId });
          const newUser = await User.findById(id);
          return done(null, newUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

configureGoogle();

module.exports = { passport, FRONTEND_URL, BACKEND_URL };
