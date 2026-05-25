import type { ReactNode } from 'react';

export function EmptyState({ title, children, role }: { title: string; children?: ReactNode; role?: string }) {
  return (
    <div role={role} className="flex min-h-40 flex-col items-center justify-center border border-dashed border-line bg-panel p-6 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children ? <p className="mt-2 max-w-xl text-sm text-zinc-600">{children}</p> : null}
    </div>
  );
}
