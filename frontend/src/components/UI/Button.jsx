import { Spinner } from './Spinner';

const variants = {
  primary:
    'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 focus-visible:ring-primary-300',
  secondary:
    'bg-white text-ink-800 border border-ink-300 hover:bg-ink-50 hover:border-ink-400 active:bg-ink-100 focus-visible:ring-ink-200',
  ghost:
    'text-ink-700 hover:bg-ink-100 active:bg-ink-200 focus-visible:ring-ink-200',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-300'
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base'
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`btn-base ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {!loading && children}
    </button>
  );
}
