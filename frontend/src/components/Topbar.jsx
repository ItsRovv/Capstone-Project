import { Input } from './UI/Input';

export function Topbar({ title, subtitle, search, onSearchChange, right }) {
  return (
    <header className="bg-white border-b border-ink-100 flex-shrink-0">
      <div className="px-4 md:px-8 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-2xl font-bold font-display text-ink-900 leading-tight break-words">
            {title}
          </h1>
          {subtitle && <p className="text-xs sm:text-sm text-ink-500 mt-0.5 line-clamp-2">{subtitle}</p>}
        </div>
        {search !== undefined && (
          <div className="hidden md:block w-72">
            <Input
              id="topbar-search"
              aria-label="Search"
              placeholder="Search…"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
        )}
        {right && <div className="flex-shrink-0 flex items-center gap-2">{right}</div>}
      </div>
      {search !== undefined && (
        <div className="md:hidden px-4 pb-3">
          <Input
            id="topbar-search-mobile"
            type="search"
            aria-label="Search"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </div>
      )}
    </header>
  );
}
