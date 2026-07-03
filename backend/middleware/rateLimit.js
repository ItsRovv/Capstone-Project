const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV === 'development';

/**
 * Strict limiter for authentication endpoints (login / register).
 * Protects against brute-force credential guessing.
 * Relaxed in development so capstone testing isn't blocked.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 10000 : 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});

/**
 * General API limiter — a sane ceiling for all other routes.
 * Development gets a very high ceiling so rapid prototyping doesn't hit 429.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

/**
 * Summary endpoint limiter — protects summarization and report generation.
 *
 * Limits per IP:
 *  - summarize-note : up to 20 calls per 15 min
 *  - generate-report: up to 5 calls per hour
 *
 * Both are covered by a combined ceiling of 30 calls per 15 minutes.
 * Development ceiling is raised so report testing is not interrupted.
 */
const summaryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Request limit reached. Please wait a few minutes before trying again.'
  }
});

/**
 * Extra-strict limiter just for report generation (daily/weekly).
 * Reports are the heaviest calls — one per day per clinic is the expected usage.
 * Development ceiling is raised for prototyping.
 */
const reportGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Report generation limit reached. You can generate up to 5 reports per hour.'
  }
});

/**
 * OTP limiter — protects the forgot-password / verify-email / reset-password
 * endpoints from being used to spam emails or brute-force codes.
 * Relaxed in development so repeated verification/reset tests are not blocked.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 10000 : 15,  // 15 OTP-related requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a few minutes and try again.' }
});

module.exports = { authLimiter, apiLimiter, summaryLimiter, reportGenLimiter, otpLimiter };
