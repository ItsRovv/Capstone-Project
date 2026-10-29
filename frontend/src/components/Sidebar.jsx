import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { queueService } from '../services/queueService';
import { Icon } from './Icon';

const STAFF_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/patients', label: 'Patients' },
  { to: '/consultations', label: 'Daily Queue' },
  { to: '/consultation-transactions', label: 'Transactions' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/pregnancy-tracking', label: 'Pregnancy Tracking' }
];

const DOCTOR_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/patients', label: 'Patients' },
  { to: '/doctor/consultations', label: 'Consultation' },
  { to: '/consultation-transactions', label: 'Transactions' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/reports', label: 'Reports' },
  { to: '/pregnancy-tracking', label: 'Pregnancy Tracking' }
];

const ADMIN_NAV = [
  { to: '/admin/settings', label: 'Clinic Settings' },
  { to: '/admin/users', label: 'Manage Users' }
];

function getNavItems(role) {
  if (role === 'admin') return [...DOCTOR_NAV, ...ADMIN_NAV];
  if (role === 'doctor') return DOCTOR_NAV;
  return STAFF_NAV;
}

export function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const [queueCount, setQueueCount] = useState(0);
  const navItems = getNavItems(user?.role);

  useEffect(() => {
    let cancelled = false;
    queueService.countWaiting().then((res) => {
      if (!cancelled) setQueueCount(res?.count || 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <aside className="h-full w-60 bg-primary-900 flex flex-col">
      {onClose && (
        <div className="flex justify-end px-3 pt-3 md:hidden">
          <button
            onClick={onClose}
            className="text-primary-200 hover:text-white p-1"
            aria-label="Close menu"
          >
            <Icon.Close />
          </button>
        </div>
      )}

      <nav className="flex-1 px-2.5 py-3">
        {navItems.map((item) => {
          return (
            <div key={item.to} className="py-1 border-b border-primary-800 last:border-b-0">
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
                 transition-colors duration-150
                 ${isActive
                    ? 'bg-primary-700 text-white'
                    : 'text-primary-100/80 hover:bg-primary-800 hover:text-white'
                 }`
              }
            >
              <span className="flex-1">{item.label}</span>
              {item.to === '/consultations' && queueCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {queueCount > 9 ? '9+' : queueCount}
                </span>
              )}
            </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="px-2.5 py-3 border-t border-primary-800">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-primary-100/80 hover:bg-primary-800 hover:text-white transition-colors"
        >
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
