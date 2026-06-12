import { useEffect } from 'react';
import clsx from 'clsx';
import { useUiStore } from '../store/uiStore';

export function ToastCenter() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const announcement = useUiStore((state) => state.announcement);

  useEffect(() => {
    // #21 slice 2 (UX-A4): only success/info toasts auto-dismiss. Error toasts
    // stay until the operator clicks them so transient failures aren't missed.
    // UX-T06: toasts with actions auto-dismiss at the same rate as their tone;
    // the operator can also click an action button which dismisses the toast.
    const timers = toasts
      .filter((toast) => toast.tone !== 'error')
      .map((toast) => window.setTimeout(() => dismissToast(toast.id), 4200));
    return () => timers.forEach(window.clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          // UX-T06: toasts with actions render as a compound widget — a non-button
          // container so action buttons and dismiss can each be focusable and
          // independently labelled (WCAG 2.4.6 / 4.1.2). Toasts without actions
          // keep the original single-button form so existing click-to-dismiss
          // behaviour is unchanged.
          toast.actions?.length ? (
            <div
              key={toast.id}
              role="status"
              aria-label={toast.message}
              className={clsx('border px-3 py-2 text-sm shadow-lg', {
                'border-emerald-300 bg-emerald-50 text-emerald-950': toast.tone === 'success',
                'border-red-300 bg-red-50 text-red-950': toast.tone === 'error',
                'border-zinc-300 bg-white text-zinc-900': toast.tone === 'info'
              })}
            >
              <p className="mb-1.5">{toast.message}</p>
              <div className="flex flex-wrap items-center gap-2">
                {toast.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={clsx('rounded border px-2 py-0.5 text-xs font-medium transition hover:opacity-80 focus:outline-none focus-visible:ring-2', {
                      'border-emerald-600 text-emerald-700 focus-visible:ring-emerald-400': toast.tone === 'success',
                      'border-red-600 text-red-700 focus-visible:ring-red-400': toast.tone === 'error',
                      'border-zinc-400 text-zinc-700 focus-visible:ring-zinc-400': toast.tone === 'info'
                    })}
                    onClick={() => {
                      action.onAction();
                      dismissToast(toast.id);
                    }}
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="ml-auto text-xs opacity-50 hover:opacity-80 focus:outline-none focus-visible:ring-2"
                  onClick={() => dismissToast(toast.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
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
          )
        ))}
      </div>
    </>
  );
}
