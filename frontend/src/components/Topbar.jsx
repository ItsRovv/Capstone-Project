import { Icon } from './Icon';
import { Input } from './UI/Input';

export function Topbar({ title, subtitle, onMenuClick, search, onSearchChange, right }) {
  return (
    <header className="bg-white/80 backdrop-blur border-b border-ink-100">
      <div className="px-4 md:px-8 py-4 flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="md:hidden text-ink-700 hover:bg-ink-100 p-2 rounded-lg"
          aria-label="Open menu"
        >
          <Icon.Menu />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold font-display text-ink-900 truncate">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-500 truncate">{subtitle}</p>}
        </div>
        {search !== undefined && (
          <div className="hidden md:block w-72">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        )}
        {right}
      </div>
    </header>
  );
}
