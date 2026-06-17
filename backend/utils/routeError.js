/**
 * Production-safe route error helper.
 *
 * In development the real error message is forwarded to the client so
 * developers can debug quickly. In production only a generic message is
 * returned, preventing internal DB details (table names, column names,
 * SQL syntax) from leaking to potential attackers.
 */
function routeError(res, err, status = 500) {
  console.error('[Route Error]', err?.stack || err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    message: isDev ? (err?.message || 'Internal error') : 'An internal server error occurred.'
  });
}

module.exports = { routeError };
