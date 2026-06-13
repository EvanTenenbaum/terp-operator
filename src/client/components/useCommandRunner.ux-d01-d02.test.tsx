// @vitest-environment jsdom
// UX-D01: success toast action config — setNextSuccessActions stages actions
//   that runCommand attaches to the toast on success.
// UX-D02: error toast auto-actions — on command failure pushToast receives
//   "Copy details" and "Open in Recovery" actions automatically.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ToastAction } from '../store/uiStore';

// Captured callbacks
type OnSuccessFn = (result: { ok: boolean; affectedIds: string[]; commandId: string; toast?: string; warnings?: string[] }) => Promise<void> | void;
type OnErrorFn = (error: { message: string }) => void;
let registeredOnSuccess: OnSuccessFn | null = null;
let registeredOnError: OnErrorFn | null = null;
const mutateAsync = vi.fn().mockResolvedValue({ ok: true, affectedIds: [], commandId: 'cmd-test' });

vi.mock('../api/trpc', () => ({
  trpc: {
    commands: {
      run: {
        useMutation: (opts: { onSuccess?: OnSuccessFn; onError?: OnErrorFn }) => {
          registeredOnSuccess = opts.onSuccess ?? null;
          registeredOnError = opts.onError ?? null;
          return { mutateAsync, isLoading: false };
        }
      }
    }
  }
}));

const pushToast = vi.fn();
const setActiveView = vi.fn();
const setGridFilter = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (state: {
    pushToast: typeof pushToast;
    setActiveView: typeof setActiveView;
    setGridFilter: typeof setGridFilter;
  }) => unknown) =>
    selector({ pushToast, setActiveView, setGridFilter })
}));

import { useCommandRunner } from './useCommandRunner';

function wrapperFactory(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useCommandRunner — UX-D01 success action config via setNextSuccessActions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    registeredOnSuccess = null;
    registeredOnError = null;
    mutateAsync.mockClear();
    pushToast.mockClear();
    setActiveView.mockClear();
    setGridFilter.mockClear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => { queryClient.clear(); });

  it('passes successActions to pushToast on a successful command', async () => {
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });
    const actionFn = vi.fn();

    act(() => {
      // UX-D01 API: stage actions immediately before runCommand.
      result.current.setNextSuccessActions([{ label: 'View payment', onAction: actionFn }]);
      result.current.runCommand('allocatePayment', { paymentId: 'pay-1' }, 'Test');
    });

    // Simulate success callback
    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-1', toast: 'Payment applied.' });
    });

    expect(pushToast).toHaveBeenCalledWith(
      'Payment applied.',
      'success',
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ label: 'View payment' })
        ])
      })
    );
  });

  it('runCommand itself is called with exactly 3 args (backward compat)', async () => {
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    act(() => {
      result.current.runCommand('allocatePayment', { paymentId: 'pay-1' }, 'Test');
    });

    // mutateAsync is the underlying function — runCommand wraps it. Verify
    // the public runCommand signature only takes 3 positional args.
    expect(mutateAsync).toHaveBeenCalledOnce();
    // runCommand's public type only has 3 params (name, payload, reason).
    // This is a compile-time guarantee, but we also verify no 4th arg bleed.
    const call = mutateAsync.mock.calls[0];
    expect(call).toHaveLength(1); // mutateAsync receives one options object
  });

  it('does NOT pass actions to pushToast when setNextSuccessActions was not called', async () => {
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    act(() => {
      result.current.runCommand('allocatePayment', { paymentId: 'pay-2' }, 'Test');
    });

    await act(async () => {
      await registeredOnSuccess!({ ok: true, affectedIds: [], commandId: 'cmd-2', toast: 'Done.' });
    });

    // pushToast called without opts (or with undefined opts)
    const [, , opts] = pushToast.mock.calls[0] as [string, string, unknown];
    expect(opts).toBeFalsy();
  });

  it('does NOT pass successActions when the command fails (ok: false)', async () => {
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });
    const actionFn = vi.fn();

    act(() => {
      result.current.setNextSuccessActions([{ label: 'View payment', onAction: actionFn }]);
      result.current.runCommand('allocatePayment', { paymentId: 'pay-3' }, 'Test');
    });

    await act(async () => {
      // ok: false — should not attach successActions to the error toast
      await registeredOnSuccess!({ ok: false, affectedIds: [], commandId: 'cmd-3', toast: 'Allocation failed.' });
    });

    const [, , opts] = pushToast.mock.calls[0] as [string, string, unknown];
    expect(opts).toBeFalsy();
  });
});

describe('useCommandRunner — UX-D02 error toast auto-actions', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    registeredOnSuccess = null;
    registeredOnError = null;
    mutateAsync.mockClear();
    pushToast.mockClear();
    setActiveView.mockClear();
    setGridFilter.mockClear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => { queryClient.clear(); });

  it('error toast includes "Copy details" and "Open in Recovery" actions', async () => {
    // Pre-set call context by calling runCommand first.
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    act(() => {
      result.current.runCommand('lockPeriod', { period: '2026-05' }, 'Lock period');
    });

    act(() => {
      registeredOnError!({ message: 'Period has open work' });
    });

    const [, tone, opts] = pushToast.mock.calls[0] as [string, string, { actions?: ToastAction[] }];
    expect(tone).toBe('error');
    const labels = opts?.actions?.map((a) => a.label) ?? [];
    expect(labels).toContain('Copy details');
    expect(labels).toContain('Open in Recovery');
  });

  it('"Open in Recovery" action navigates to the recovery view with a prefilter', () => {
    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    act(() => {
      result.current.runCommand('allocatePayment', { paymentId: 'p-1' }, 'Allocate');
    });

    act(() => {
      registeredOnError!({ message: 'Not enough credit' });
    });

    const [, , opts] = pushToast.mock.calls[0] as [string, string, { actions?: ToastAction[] }];
    const openRecovery = opts?.actions?.find((a) => a.label === 'Open in Recovery');
    expect(openRecovery).toBeDefined();

    // Calling onAction should navigate to recovery view and set a grid filter.
    openRecovery!.onAction();
    expect(setGridFilter).toHaveBeenCalledWith('recovery', expect.stringContaining('allocatePayment'));
    expect(setActiveView).toHaveBeenCalledWith('recovery');
  });

  it('"Copy details" action copies command name, key, and error to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { result } = renderHook(() => useCommandRunner(), { wrapper: wrapperFactory(queryClient) });

    act(() => {
      result.current.runCommand('postSalesOrder', { orderId: 'o-1' }, 'Post order');
    });

    act(() => {
      registeredOnError!({ message: 'Insufficient inventory' });
    });

    const [, , opts] = pushToast.mock.calls[0] as [string, string, { actions?: ToastAction[] }];
    const copyDetails = opts?.actions?.find((a) => a.label === 'Copy details');
    expect(copyDetails).toBeDefined();

    copyDetails!.onAction();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('postSalesOrder')
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Insufficient inventory')
    );
  });
});
