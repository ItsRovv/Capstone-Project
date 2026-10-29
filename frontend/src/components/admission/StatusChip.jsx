import { Badge } from '../UI/Badge';
import { STATUS_META } from '../../lib/admission';

export function StatusChip({ status, className = '' }) {
  const meta = STATUS_META[status] || { label: status, tone: 'default' };
  return <Badge tone={meta.tone} className={className}>{meta.label}</Badge>;
}
