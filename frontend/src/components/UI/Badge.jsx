const tones = {
  default: 'bg-ink-100 text-ink-700',
  primary: 'bg-primary-50 text-primary-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700'
};

export function Badge({ children, tone = 'default', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const appointmentTones = {
  scheduled: 'info',
  completed: 'success',
  cancelled: 'danger'
};

export function StatusBadge({ status }) {
  return <Badge tone={appointmentTones[status] || 'default'}>{status}</Badge>;
}

const roleTones = { admin: 'primary', doctor: 'info', staff: 'default' };
export function RoleBadge({ role }) {
  return <Badge tone={roleTones[role] || 'default'}>{role}</Badge>;
}
