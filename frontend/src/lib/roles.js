// Shared role helpers used across routing, redirects, and navigation.

export const STAFF_ROLES = ['admin', 'doctor', 'nurse', 'staff'];

// The admission midwife only works in Admission and Discharge.
export const MIDWIFE_ROLE = 'midwife';
export const CLINIC_APP_ROLES = [...STAFF_ROLES, MIDWIFE_ROLE];

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

export function isMidwife(role) {
  return role === MIDWIFE_ROLE;
}

/**
 * The landing route a user should be sent to after login.
 * Staff roles land on the clinic app at '/', the admission midwife on Admission and Discharge.
 * Unknown / legacy roles are sent back to login.
 */
export function roleHome(role) {
  if (role === MIDWIFE_ROLE) return '/admissions';
  return STAFF_ROLES.includes(role) ? '/' : '/login';
}
