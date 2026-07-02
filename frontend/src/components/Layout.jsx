import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-cream">
      {/* Desktop sidebar */}
      <div className="hidden md:block flex-shrink-0 h-full overflow-hidden">
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

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        <Outlet context={{ onOpenMenu: () => setMobileOpen(true) }} />
      </div>
    </div>
  );
}
