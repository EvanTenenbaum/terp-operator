import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  body?: string;
  tone?: 'default' | 'danger';
  primaryLabel?: string;
  cancelLabel?: string;
  persist?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmState {
  pending: ConfirmRequest | null;
  show: (opts: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
}

/**
 * confirmStore — module-level Zustand store backing the useConfirm() primitive.
 *
 * Usage: call `show(opts)` to open the dialog, `settle(bool)` to resolve it.
 * Components should use `useConfirm()` instead of accessing this store directly.
 */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,

  show: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ pending: { ...opts, resolve } });
    }),

  settle: (value) => {
    const { pending } = get();
    if (pending) {
      pending.resolve(value);
      set({ pending: null });
    }
  },
}));
