/**
 * Map known database / third-party errors to safe, generic client messages.
 * Prevents information leakage (table names, constraint details, internal paths).
 */

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function mapErrorToClientMessage(err) {
  // Postgres errors
  if (err.code === PG_UNIQUE_VIOLATION) {
    return 'That value already exists. Please use a different one.';
  }
  if (err.code === PG_FOREIGN_KEY_VIOLATION) {
    return 'Cannot delete or modify this record because it is still referenced elsewhere.';
  }

  // Query timeout (from our own race-timeout)
  if (err.message && err.message.includes('Query timed out')) {
    return 'The request took too long. Please try again.';
  }

  // AI service errors
  if (err.message && err.message.includes('AI')) {
    return 'The AI service is temporarily unavailable. Please try again later.';
  }

  // Default: generic message
  return null; // signals caller to use default generic message
}

module.exports = { mapErrorToClientMessage };
