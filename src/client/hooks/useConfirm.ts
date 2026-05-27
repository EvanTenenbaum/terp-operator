import { useConfirmStore } from '../store/confirmStore';

export type { ConfirmOptions } from '../store/confirmStore';

/**
 * useConfirm — promise-based confirmation primitive (TER-1614, F-11).
 *
 * Returns a stable function that opens a modal confirmation dialog and resolves
 * to `true` if the user confirms, or `false` if they cancel/dismiss.
 *
 * Requires `<ConfirmRoot />` to be mounted somewhere in the React tree
 * (App.tsx mounts it after providers).
 *
 * @example
 * const confirm = useConfirm();
 * const ok = await confirm({ title: 'Delete this item?', tone: 'danger' });
 * if (!ok) return;
 * // proceed with destructive action
 */
export function useConfirm(): (opts: import('../store/confirmStore').ConfirmOptions) => Promise<boolean> {
  return useConfirmStore((state) => state.show);
}
