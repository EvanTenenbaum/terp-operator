// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Minimal stubs — only mock what these tests exercise
vi.mock('../api/trpc', () => {
  const savedFilters = [
    {
      id: 'f1', userId: 'u1', name: 'Aging premium', description: undefined,
      targetView: 'inventory', filterDefinition: { logic: 'AND', conditions: [] },
      schemaVersion: 1, isGlobal: false, createdAt: new Date(), updatedAt: new Date(),
      createdBy: 'u1', updatedBy: 'u1',
    },
  ];
  return {
    trpc: {
      queries: { reference: { useQuery: () => ({ data: { availableBatches: [], vendors: [] }, isLoading: false }) } },
      useQueries: () => [],
      filters: {
        listSavedFilters: { useQuery: () => ({ data: savedFilters }) },
        saveFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        updateFilter: { useMutation: ({ onSuccess, onError }: any) => ({ mutate: vi.fn().mockImplementation(() => onSuccess?.()), isPending: false }) },
        deleteFilter: { useMutation: ({ onSuccess, onError }: any) => ({ mutate: vi.fn().mockImplementation(() => onSuccess?.()), isPending: false }) },
      },
      auth: { me: { useQuery: () => ({ data: { id: 'u1', role: 'operator' } }) } },
      useContext: () => ({ filters: { listSavedFilters: { invalidate: vi.fn() } } }),
    },
  };
});

import { InventoryFinderPanel } from './InventoryFinderPanel';

describe('InventoryFinderPanel filter management', () => {
  it('shows Manage button next to saved-filter dropdown', () => {
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: /manage saved filters/i })).toBeInTheDocument();
  });

  it('toggles SavedFiltersManager on Manage button click', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    expect(screen.queryByText('My filters')).toBeNull();
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    expect(screen.getByText('My filters')).toBeInTheDocument();
  });

  it('closes SavedFiltersManager on second click', async () => {
    const user = userEvent.setup();
    render(<InventoryFinderPanel onAddBatch={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    await user.click(screen.getByRole('button', { name: /manage saved filters/i }));
    expect(screen.queryByText('My filters')).toBeNull();
  });
});
