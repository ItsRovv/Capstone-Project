const crypto = require('crypto');

const HEADER = 'x-request-id';

/**
 * Attach a unique request ID to every incoming request.
 * - Reuses an ID if the caller already sent one (e.g., frontend or load balancer).
 * - Returns the ID in every response header so errors can be correlated.
 */
function requestId(req, res, next) {
  const id = req.get(HEADER) || crypto.randomUUID();
  req.id = id;
  res.set(HEADER, id);
  next();
}

module.exports = { requestId, HEADER };
