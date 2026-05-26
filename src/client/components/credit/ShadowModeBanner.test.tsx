// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const creditEngineStancesQueryMock = vi.fn();
const isBannerDismissedQueryMock = vi.fn();
const dismissBannerMutateMock = vi.fn();
const clearBannerDismissalMutateMock = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    credit: {
      creditEngineStances: {
        useQuery: (input: unknown, options: unknown) =>
          creditEngineStancesQueryMock(input, options),
      },
      // TER-1587: DB-backed banner dismiss endpoints
      isBannerDismissed: {
        useQuery: (_input: unknown, _options: unknown) =>
          isBannerDismissedQueryMock(_input, _options),
      },
      dismissBanner: {
        useMutation: () => ({ mutate: dismissBannerMutateMock }),
      },
      clearBannerDismissal: {
        useMutation: () => ({ mutate: clearBannerDismissalMutateMock }),
      },
    },
  },
}));

import { ShadowModeBanner } from './ShadowModeBanner';
import { useUiStore } from '../../store/uiStore';

function resetUiStore() {
  window.localStorage.clear();
  useUiStore.setState({ dismissedShadowBanner: false });
}

function mockShadowMode(shadowMode: boolean) {
  creditEngineStancesQueryMock.mockReturnValue({
    data: {
      stances: [],
      config: {
        globalDefaultStanceId: 'stance-1',
        coldStartMinPostedInvoices: 3,
        coldStartMinTenureDays: 30,
        manualOverrideReminderDefaultDays: 30,
        manualOverrideSnoozeCapDays: 90,
        shadowMode,
      },
    },
    isLoading: false,
    error: null,
  });
}

/** Set up the isBannerDismissed query mock return value. */
function mockDismissalState(dismissed: boolean) {
  isBannerDismissedQueryMock.mockReturnValue({
    data: { dismissed },
    isLoading: false,
    error: null,
  });
}

describe('ShadowModeBanner', () => {
  beforeEach(() => {
    creditEngineStancesQueryMock.mockReset();
    isBannerDismissedQueryMock.mockReset();
    dismissBannerMutateMock.mockReset();
    clearBannerDismissalMutateMock.mockReset();
    // Default: not dismissed in DB
    mockDismissalState(false);
    resetUiStore();
  });

  it('renders banner when engine config shadowMode is true', () => {
    mockShadowMode(true);
    render(<ShadowModeBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/shadow mode/i)).toBeInTheDocument();
  });

  it('does not render banner when engine config shadowMode is false', () => {
    mockShadowMode(false);
    const { container } = render(<ShadowModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render banner while engine config is loading', () => {
    creditEngineStancesQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { container } = render(<ShadowModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render banner while dismissal query is loading', () => {
    mockShadowMode(true);
    isBannerDismissedQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { container } = render(<ShadowModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides banner after user clicks Dismiss, updates UiStore, and calls dismissBanner mutation', async () => {
    mockShadowMode(true);
    const user = userEvent.setup();
    const { rerender } = render(<ShadowModeBanner />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<ShadowModeBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(useUiStore.getState().dismissedShadowBanner).toBe(true);
    expect(dismissBannerMutateMock).toHaveBeenCalledWith({ bannerKey: 'shadow-mode' });
  });

  it('hides banner when DB says it was already dismissed (cross-session persistence)', () => {
    mockShadowMode(true);
    mockDismissalState(true);
    render(<ShadowModeBanner />);
    // DB says dismissed → UiStore synced → banner hidden
    expect(useUiStore.getState().dismissedShadowBanner).toBe(true);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows banner again when shadow mode flips off → on (per-mode dismissal scope)', async () => {
    mockShadowMode(true);
    const user = userEvent.setup();
    const { rerender } = render(<ShadowModeBanner />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    mockShadowMode(false);
    rerender(<ShadowModeBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // clearBannerDismissal should be called when shadow mode turns off
    expect(clearBannerDismissalMutateMock).toHaveBeenCalledWith({ bannerKey: 'shadow-mode' });

    // DB no longer dismissed (cleared), mode comes back on
    mockDismissalState(false);
    mockShadowMode(true);
    rerender(<ShadowModeBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(useUiStore.getState().dismissedShadowBanner).toBe(false);
  });
});
