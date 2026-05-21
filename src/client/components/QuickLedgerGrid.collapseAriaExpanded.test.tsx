// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));

vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false });
  const procProxy: unknown = new Proxy(
    {},
    {
      get(_t, _p: string) {
        return { useQuery: empty };
      }
    }
  );
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner' } }) } },
      queries: procProxy
    }
  };
});

import { QuickLedgerGrid } from './QuickLedgerGrid';

describe('QuickLedgerGrid section header a11y (#34)', () => {
  it('section collapse buttons expose aria-expanded that reflects collapsed state', async () => {
    const user = userEvent.setup();
    render(<QuickLedgerGrid />);

    // Two sections render: "Receiving Ledger" and "Paying Ledger". Each
    // header is a <button> whose accessible name includes the title.
    const receiving = screen.getByRole('button', { name: /receiving ledger/i });
    const paying = screen.getByRole('button', { name: /paying ledger/i });

    // Initially both sections are expanded (collapsed = false).
    expect(receiving.getAttribute('aria-expanded')).toBe('true');
    expect(paying.getAttribute('aria-expanded')).toBe('true');

    // Toggle one and confirm only its aria-expanded flips.
    await user.click(receiving);
    expect(receiving.getAttribute('aria-expanded')).toBe('false');
    expect(paying.getAttribute('aria-expanded')).toBe('true');
  });
});
