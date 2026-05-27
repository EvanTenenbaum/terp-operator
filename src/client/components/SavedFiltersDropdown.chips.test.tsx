// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedFiltersDropdown } from './SavedFiltersDropdown';
import type { SavedFilterOutput } from '../../shared/filterSchemas';

function makeFilter(id: string, name: string, updatedAt: Date): SavedFilterOutput {
  return {
    id,
    name,
    description: undefined,
    targetView: 'inventory',
    filterDefinition: { logic: 'AND', conditions: [] },
    isGlobal: false,
    userId: 'user-1',
    schemaVersion: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt,
    createdBy: 'user-1',
    updatedBy: 'user-1',
  };
}

const FILTERS: SavedFilterOutput[] = [
  makeFilter('f1', 'Premium Aged', new Date('2026-05-01')),
  makeFilter('f2', 'In-House Only', new Date('2026-05-10')),
  makeFilter('f3', 'Low Stock', new Date('2026-04-20')),
];

describe('SavedFiltersDropdown chips (TER-1629)', () => {
  it('renders a chip for each saved filter (up to 5)', () => {
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId={null} onSelect={() => {}} />);
    // All three filters should appear as buttons
    expect(screen.getByRole('button', { name: 'Premium Aged' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'In-House Only' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Low Stock' })).toBeDefined();
  });

  it('does not render any chips when savedFilters is empty', () => {
    render(<SavedFiltersDropdown savedFilters={[]} selectedId={null} onSelect={() => {}} />);
    // No buttons (chips) should be rendered
    const buttons = screen.queryAllByRole('button');
    expect(buttons).toHaveLength(0);
  });

  it('clicking a chip calls onSelect with the filter id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId={null} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'In-House Only' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('f2');
  });

  it('caps chips at 5 when more than 5 filters are provided', () => {
    const manyFilters: SavedFilterOutput[] = Array.from({ length: 8 }, (_, i) =>
      makeFilter(`id-${i}`, `Filter ${i + 1}`, new Date(2026, 0, i + 1))
    );
    render(<SavedFiltersDropdown savedFilters={manyFilters} selectedId={null} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('marks the active chip with aria-pressed=true and the success class', () => {
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId="f2" onSelect={() => {}} />);
    const activeChip = screen.getByRole('button', { name: 'In-House Only' });
    expect(activeChip.getAttribute('aria-pressed')).toBe('true');
    expect(activeChip.className).toContain('success');
  });

  it('inactive chips have aria-pressed=false', () => {
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId="f2" onSelect={() => {}} />);
    const inactiveChip = screen.getByRole('button', { name: 'Premium Aged' });
    expect(inactiveChip.getAttribute('aria-pressed')).toBe('false');
    expect(inactiveChip.className).not.toContain('success');
  });

  it('chip order is most-recently-updated first', () => {
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId={null} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    // FILTERS updatedAt order: f2 (May 10) > f1 (May 01) > f3 (Apr 20)
    expect(buttons[0].textContent).toBe('In-House Only');
    expect(buttons[1].textContent).toBe('Premium Aged');
    expect(buttons[2].textContent).toBe('Low Stock');
  });

  it('still renders the select dropdown alongside chips', () => {
    render(<SavedFiltersDropdown savedFilters={FILTERS} selectedId={null} onSelect={() => {}} />);
    const select = document.querySelector('select');
    expect(select).not.toBeNull();
    expect(select?.getAttribute('aria-label')).toBe('Load saved filter');
  });
});
