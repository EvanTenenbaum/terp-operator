// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSetGridFilter = vi.fn();
let storedFilter = '';
vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setGridFilter: mockSetGridFilter,
      gridFilters: { orders: storedFilter }
    })
}));

import { FilterPresetStrip } from './FilterPresetStrip';

describe('FilterPresetStrip (templates)', () => {
  beforeEach(() => {
    mockSetGridFilter.mockClear();
    storedFilter = '';
  });

  it('renders a role=group with one aria-pressed button per preset', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[
          { label: 'All Open', filter: 'status:draft,confirmed' },
          { label: 'Confirmed', filter: 'status:confirmed' }
        ]}
      />
    );
    const group = screen.getByRole('group', { name: 'Filter by status' });
    expect(group).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies the preset filter on click', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Confirmed', filter: 'status:confirmed' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));
    expect(mockSetGridFilter).toHaveBeenCalledWith('orders', 'status:confirmed');
  });

  it('clears the filter when the active preset is clicked again (toggle semantics)', () => {
    storedFilter = 'status:confirmed';
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Confirmed', filter: 'status:confirmed' }]}
      />
    );
    const button = screen.getByRole('button', { name: 'Confirmed' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(mockSetGridFilter).toHaveBeenCalledWith('orders', '');
  });

  it('supports dynamic filters (function form) for time-relative presets', () => {
    const today = new Date().toISOString().slice(0, 10);
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ key: 'today', label: 'Today', filter: () => `createdAt:${today}` }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(mockSetGridFilter).toHaveBeenCalledWith('orders', `createdAt:${today}`);
  });
});
