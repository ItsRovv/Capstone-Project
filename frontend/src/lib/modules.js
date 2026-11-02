// Per-account module access. Applies to admin accounts only — when an admin
// has allowed_modules set, it fully decides what they see; when it is NULL
// the admin keeps unrestricted access. Other roles keep role-based access.

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'consultations', label: 'Consultation / Daily Queue' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'admissions', label: 'Admission and Discharge' },
  { key: 'reports', label: 'Reports' },
  { key: 'pregnancy-tracking', label: 'Pregnancy Tracking' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'clinic-settings', label: 'Clinic Settings' },
  { key: 'manage-users', label: 'Manage Users' }
];

const ROUTE_MAP = [
  ['/admin/users', 'manage-users'],
  ['/admin/settings', 'clinic-settings'],
  ['/pregnancy-tracking', 'pregnancy-tracking'],
  ['/transactions', 'transactions'],
  ['/admissions', 'admissions'],
  ['/monitoring', 'monitoring'],
  ['/patients', 'patients'],
  ['/consultations', 'consultations'],
  ['/doctor/consultations', 'consultations'],
  ['/reports', 'reports']
];

export function moduleForPath(pathname) {
  if (!pathname || pathname === '/') return 'dashboard';
  for (const [prefix, key] of ROUTE_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key;
  }
  return null;
}

function level(user, key) {
  if (!user || user.role !== 'admin') return 'edit';
  const mods = user.allowed_modules;
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) return 'edit';
  return mods[key] === 'view' || mods[key] === 'edit' ? mods[key] : 'off';
}

export function canViewModule(user, key) {
  return level(user, key) !== 'off';
}

export function canEditModule(user, key) {
  return level(user, key) === 'edit';
}
