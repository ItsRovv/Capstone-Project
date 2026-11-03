import { STATUS_META } from '../../lib/admission';

const statusClasses = {
  admitted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  in_labor: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  discharged: 'bg-primary-50 text-primary-700 ring-1 ring-primary-200',
  referred: 'bg-red-50 text-red-700 ring-1 ring-red-200'
};

export function StatusChip({ status, className = '' }) {
  const meta = STATUS_META[status] || { label: status };
  const styles = statusClasses[status] || 'bg-ink-100 text-ink-700 ring-1 ring-ink-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles} ${className}`}>
      {meta.label}
    </span>
  );
}
