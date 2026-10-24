export function Card({ children, className = '', hover = false, padding = 'p-4 sm:p-6' }) {
  return (
    <div className={`card ${padding} ${hover ? 'card-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
