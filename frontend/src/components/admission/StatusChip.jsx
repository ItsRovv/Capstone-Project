import { STATUS_META } from '../../lib/admission';

const statusClasses = {
  admitted: 'bg-ink-100 text-ink-700',
  in_labor: 'bg-amber-50 text-amber-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  discharged: 'bg-primary-50 text-primary-700',
  referred: 'bg-red-50 text-red-700'
};

export function StatusChip({ status, className = '' }) {
  const meta = STATUS_META[status] || { label: status };
  const styles = statusClasses[status] || 'bg-ink-100 text-ink-700';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${styles} ${className}`}>
      {meta.label}
    </span>
  );
}
