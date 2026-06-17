const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for authentication endpoints (login / register).
 * Protects against brute-force credential guessing.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});

/**
 * General API limiter — a sane ceiling for all other routes.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

/**
 * AI endpoint limiter — protects Gemini API quota and prevents token abuse.
 *
 * Limits per IP:
 *  - summarize-note : up to 20 calls per 15 min (multiple notes per consultation)
 *  - generate-report: up to 5 calls per hour   (one report per day is typical)
 *
 * Both are covered by a combined ceiling of 30 AI calls per 15 minutes.
 * This keeps usage well within Gemini's free-tier limits (15 req/min, 1 500/day).
 */
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // max 30 AI requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'AI request limit reached. Please wait a few minutes before generating again.'
  }
});

/**
 * Extra-strict limiter just for report generation (daily/weekly).
 * Reports are the heaviest AI calls — one per day per clinic is the expected usage.
 */
const reportGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // max 5 report generations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Report generation limit reached. You can generate up to 5 reports per hour.'
  }
});

module.exports = { authLimiter, apiLimiter, aiLimiter, reportGenLimiter };
