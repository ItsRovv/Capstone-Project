import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let id = 0;
const tones = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800'
};
const icons = {
  success: '✓',
  error: '✕',
  info: 'i',
  warning: '!'
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'info', duration = 3500, action = null) => {
    const tid = ++id;
    setToasts((t) => [...t, { id: tid, message, tone, action }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== tid));
    }, duration);
  }, []);

  const value = {
    success: (m, opts) => push(m, 'success', opts?.duration ?? 3500, opts?.action),
    error: (m, opts) => push(m, 'error', opts?.duration ?? 3500, opts?.action),
    info: (m, opts) => push(m, 'info', opts?.duration ?? 3500, opts?.action),
    warning: (m, opts) => push(m, 'warning', opts?.duration ?? 3500, opts?.action)
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[260px] max-w-sm flex items-start gap-3 px-4 py-3 rounded-xl border shadow-card animate-slide-up ${tones[t.tone]}`}
            role="status"
          >
            <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-white/70 text-xs font-bold flex-shrink-0">
              {icons[t.tone]}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                    t.action.onClick?.();
                  }}
                  className="mt-1 text-xs font-bold underline underline-offset-2 hover:opacity-80"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
