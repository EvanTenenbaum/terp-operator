// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
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
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner', email: 'op@example.test', name: 'Op', workLoop: null } }) } },
      queries: procProxy
    }
  };
});

import { CommandPalette } from './CommandPalette';
import { useUiStore } from '../store/uiStore';

describe('CommandPalette advanced-payload toggle a11y (#34)', () => {
  beforeEach(() => {
    // Open the palette so the toggle renders. advancedOpen defaults to false.
    useUiStore.setState({ commandPaletteOpen: true, commandPaletteAdvancedOpen: false });
  });

  it('Advanced payload button exposes aria-expanded reflecting advancedOpen state', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);

    const advanced = screen.getByRole('button', { name: /advanced payload/i });
    expect(advanced.getAttribute('aria-expanded')).toBe('false');

    await user.click(advanced);
    expect(advanced.getAttribute('aria-expanded')).toBe('true');
  });
});
