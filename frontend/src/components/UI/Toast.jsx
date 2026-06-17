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

  const push = useCallback((message, tone = 'info', duration = 3500) => {
    const tid = ++id;
    setToasts((t) => [...t, { id: tid, message, tone }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== tid));
    }, duration);
  }, []);

  const value = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
    warning: (m) => push(m, 'warning')
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
            <p className="text-sm font-medium leading-snug">{t.message}</p>
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
