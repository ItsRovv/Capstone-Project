import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from './Icon';
import { JLMCLogo } from './JLMCLogo';

export function Header({ onOpenMenu }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header className="h-14 flex-shrink-0 bg-primary-700 border-b border-primary-800 flex items-center justify-between px-3 md:px-4 z-30">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onOpenMenu}
          className="md:hidden text-white/90 hover:bg-white/10 p-1.5 rounded-md flex-shrink-0"
          aria-label="Open menu"
        >
          <Icon.Menu width={20} height={20} />
        </button>
        <JLMCLogo size={30} className="flex-shrink-0 border border-white/20" />
        <div className="min-w-0 leading-tight hidden sm:block">
          <p className="text-white font-semibold text-sm truncate">
            Jean Lying-in Maternity Clinic
          </p>
          <p className="text-primary-100 text-[11px] truncate">
            Clinic Management Portal
          </p>
        </div>
      </div>

      <div className="flex items-center flex-shrink-0">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-md hover:bg-white/10"
            aria-label="Account menu"
            type="button"
          >
            <span className="w-7 h-7 rounded-full bg-white/15 text-white text-xs font-semibold inline-flex items-center justify-center flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
            <span className="hidden md:block text-white text-sm font-medium whitespace-nowrap">
              {user?.name}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg border border-ink-100 shadow-card py-1 animate-fade-in">
              <div className="px-3 py-2 border-b border-ink-100">
                <p className="text-sm font-medium text-ink-900 truncate">{user?.name}</p>
                <p className="text-xs text-ink-500 truncate capitalize">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-600 hover:bg-red-50 hover:text-red-600"
              >
                <Icon.Logout width={16} height={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
