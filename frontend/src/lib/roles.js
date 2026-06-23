// Shared role helpers used across routing, redirects, and navigation.

export const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'staff'];

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * The landing route a user should be sent to after login.
 * All staff roles land on the clinic app at '/'.
 * Unknown / legacy roles are sent back to login.
 */
export function roleHome(role) {
  return ['admin', 'doctor', 'nurse', 'staff'].includes(role) ? '/' : '/login';
}
