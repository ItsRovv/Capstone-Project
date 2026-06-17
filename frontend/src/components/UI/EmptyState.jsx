export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-ink-300 mb-4">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
