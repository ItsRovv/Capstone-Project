export function Card({ children, className = '', hover = false, padding = 'p-6' }) {
  return (
    <div className={`card ${padding} ${hover ? 'card-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
