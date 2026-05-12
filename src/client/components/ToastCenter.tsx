import { useEffect } from 'react';
import clsx from 'clsx';
import { useUiStore } from '../store/uiStore';

export function ToastCenter() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const announcement = useUiStore((state) => state.announcement);

  useEffect(() => {
    const timers = toasts.map((toast) => window.setTimeout(() => dismissToast(toast.id), 4200));
    return () => timers.forEach(window.clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <button
            type="button"
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className={clsx('border px-3 py-2 text-left text-sm shadow-lg', {
              'border-emerald-300 bg-emerald-50 text-emerald-950': toast.tone === 'success',
              'border-red-300 bg-red-50 text-red-950': toast.tone === 'error',
              'border-zinc-300 bg-white text-zinc-900': toast.tone === 'info'
            })}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </>
  );
}
