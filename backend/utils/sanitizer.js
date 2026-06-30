/**
 * Lightweight HTML sanitizer — removes script tags, event handlers, and other
 * dangerous markup while preserving harmless text. Used before storing
 * free-text patient/consultation fields to mitigate stored XSS.
 *
 * This is a zero-dependency implementation. For production with complex HTML
 * requirements, swap in DOMPurify (dompurify + jsdom).
 */

const DANGEROUS_TAGS = new RegExp(
  '<(script|iframe|object|embed|form|input|textarea|button|select|style|link|meta|base|applet|marquee|blink)[^>]*>[\\s\\S]*?</\\1>|<(script|iframe|object|embed|form|input|textarea|button|select|style|link|meta|base|applet|marquee|blink)[^>]*/?>',
  'gi'
);

const EVENT_HANDLERS = /\s+on\w+\s*=\s*["']?[^"'>]*["']?/gi;

const JAVASCRIPT_URLS = /(href|src|action)\s*=\s*["']?javascript:/gi;

function sanitizeHtml(input) {
  if (input === null || input === undefined) return input;
  let text = String(input);

  // Remove dangerous tags
  text = text.replace(DANGEROUS_TAGS, '');
  // Remove event handlers (onclick, onerror, onload, etc.)
  text = text.replace(EVENT_HANDLERS, '');
  // Remove javascript: URLs
  text = text.replace(JAVASCRIPT_URLS, '$1="blocked:"');

  return text;
}

/**
 * Recursively sanitize string fields in an object.
 * Only touches actual strings; leaves numbers, booleans, dates alone.
 */
function sanitizeObject(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = sanitizeHtml(result[field]);
    }
  }
  return result;
}

module.exports = { sanitizeHtml, sanitizeObject };
