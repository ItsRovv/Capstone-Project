const AuditLog = require('../models/AuditLog');

/**
 * Create an audit middleware factory.
 *
 * Usage:
 *   router.post('/', audit('CREATE', 'patients'), async (req, res) => { ... })
 *
 * The middleware captures req.user.id, req.ip, and the old/new state of the record.
 * For CREATE it logs the new state; for UPDATE it tries to fetch the old state first;
 * for DELETE it logs the old state.
 */
function audit(action, tableName, { getOld = null } = {}) {
  return async (req, res, next) => {
    // Store the audit config on the request so the route handler can call logAudit
    req._audit = { action, tableName, getOld };
    next();
  };
}

/**
 * Call this inside route handlers after a mutation succeeds.
 * Automatically reads req.user.id, req.ip, and the audit config set by the middleware.
 *
 * @param {object} req - Express request
 * @param {number|string} recordId - ID of the affected record
 * @param {object} newData - The new data (for CREATE/UPDATE)
 */
async function logAudit(req, recordId, newData) {
  const config = req._audit || req.auditConfig;
  if (!config) return;

  const { action, tableName, getOld } = config;
  let oldData = null;

  if ((action === 'UPDATE' || action === 'DELETE') && getOld) {
    try {
      oldData = await getOld(recordId);
    } catch {
      // If old fetch fails, still log the action without old_data
    }
  }

  try {
    await AuditLog.create({
      userId: req.user?.id ?? null,
      action,
      tableName,
      recordId,
      oldData: oldData || undefined,
      newData: newData || undefined,
      ipAddress: req.ip || req.connection?.remoteAddress || null
    });
  } catch (err) {
    // Audit logging must never break the main transaction.
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

module.exports = { audit, logAudit };
