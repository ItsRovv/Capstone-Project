import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DbStatusBanner } from './DbStatusBanner';
import { useAuth } from '../contexts/AuthContext';
import { MODULES, canViewModule, canEditModule, moduleForPath } from '../lib/modules';

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const modKey = moduleForPath(location.pathname);
  const blocked = modKey ? !canViewModule(user, modKey) : false;
  const readOnly = modKey ? canViewModule(user, modKey) && !canEditModule(user, modKey) : false;
  const modLabel = MODULES.find((m) => m.key === modKey)?.label || 'this module';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Header onOpenMenu={() => setMobileOpen(true)} />
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden print:block print:overflow-visible">
        {/* Desktop sidebar */}
        <div className="hidden md:block flex-shrink-0 h-full overflow-hidden print:hidden">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-ink-900/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="relative animate-slide-up">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className={`flex-1 min-w-0 h-full overflow-y-auto print:h-auto print:overflow-visible ${readOnly ? 'module-readonly' : ''}`}>
          <DbStatusBanner />
          {blocked ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="max-w-sm text-center">
                <p className="text-lg font-bold text-ink-800">No access</p>
                <p className="text-sm text-ink-500 mt-2">
                  Your account doesn't have access to {modLabel}. Ask an administrator to enable it in Manage Users.
                </p>
              </div>
            </div>
          ) : (
            <>
              {readOnly && (
                <div className="print:hidden bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 text-center">
                  Read-only access — you can view {modLabel} but not make changes.
                </div>
              )}
              <Outlet context={{ onOpenMenu: () => setMobileOpen(true) }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
