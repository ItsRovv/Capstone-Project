export function Input({ label, error, hint, className = '', id, ...rest }) {
  const inputId = id || `in-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input-base ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Textarea({ label, error, hint, className = '', id, rows = 4, ...rest }) {
  const inputId = id || `ta-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={`input-base resize-y ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Select({ label, error, hint, children, className = '', id, ...rest }) {
  const inputId = id || `sel-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={`input-base pr-9 ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
