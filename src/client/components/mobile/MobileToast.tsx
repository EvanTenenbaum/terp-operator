import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: string;
  message: string;
  variant: 'success' | 'error';
}

interface ToastContextValue {
  addToast: (message: string, variant?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useMobileToast() {
  return useContext(ToastContext);
}

export function MobileToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up all pending timers on unmount
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const addToast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    const id = String(++nextId.current);
    setToasts(prev => [...prev, { id, message, variant }]);
    const t = setTimeout(() => {
      timers.current.delete(id);
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
    timers.current.set(id, t);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast stack — positioned above bottom nav.
          Single aria-live="polite" container; individual items do NOT use role="status"
          to prevent double-announcement by screen readers. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-xs items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: t.variant === 'success' ? 'var(--m-field)' : 'var(--m-danger-soft)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              animation: 'm-fade-slide-in 150ms ease-out forwards',
            }}
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background: t.variant === 'success' ? 'var(--m-accent)' : 'var(--m-danger)',
                color: 'var(--m-on-accent)',
              }}
            >
              {t.variant === 'success' ? '✓' : '✕'}
            </span>
            <p className="flex-1 text-sm" style={{ color: 'var(--m-ink)', fontWeight: 500 }}>{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
