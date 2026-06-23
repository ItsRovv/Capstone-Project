import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from './Icon';
import { RoleBadge } from './UI/Badge';
import { JLMCLogo } from './JLMCLogo';

const STAFF_NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.Dashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Icon.Users },
  { to: '/consultations', label: 'Consultations', icon: Icon.Stethoscope },
  { to: '/reports', label: 'Reports', icon: Icon.Report }
];

const ADMIN_NAV = [
  { to: '/admin/users', label: 'Manage Users', icon: Icon.User }
];

export function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navItems = user?.role === 'admin' ? [...STAFF_NAV, ...ADMIN_NAV] : STAFF_NAV;

  return (
    <aside className="h-full w-64 bg-white border-r border-ink-100 flex flex-col">
      <div className="px-4 py-4 border-b border-ink-100">
        {onClose && (
          <div className="flex justify-end mb-1 md:hidden">
            <button
              onClick={onClose}
              className="text-ink-500 hover:text-ink-800 p-1"
              aria-label="Close menu"
            >
              <Icon.Close />
            </button>
          </div>
        )}
        <div className="flex flex-col items-center text-center gap-2">
          <JLMCLogo size={48} className="rounded-2xl flex-shrink-0" />
          <div>
            <p className="font-display font-bold text-ink-900 text-sm leading-snug">
              Jean Lying-in Maternity Clinic
            </p>
            <p className="text-xs text-ink-500 mt-0.5">Tughan, Juban, Sorsogon</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const IconComp = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                 transition-all duration-200
                 ${isActive
                    ? 'bg-primary-50 text-primary-700 shadow-glow'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900 hover:translate-x-0.5'
                 }`
              }
            >
              <IconComp />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-ink-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-900 truncate">{user?.name}</p>
            <RoleBadge role={user?.role} />
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Icon.Logout />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
