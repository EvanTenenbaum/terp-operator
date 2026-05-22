// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateFilterMutate = vi.fn();
const deleteFilterMutate = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    filters: {
      updateFilter: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => { updateFilterMutate(input); onSuccess?.(); },
          isPending: false,
        }),
      },
      deleteFilter: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => { deleteFilterMutate(input); onSuccess?.(); },
          isPending: false,
        }),
      },
    },
  },
}));

import { SavedFiltersManager } from './SavedFiltersManager';
import type { SavedFilterOutput } from '../../shared/filterSchemas';

function makeFilter(overrides: Partial<SavedFilterOutput> = {}): SavedFilterOutput {
  return {
    id: 'filter-1',
    userId: 'user-1',
    name: 'My Filter',
    description: undefined,
    targetView: 'inventory',
    filterDefinition: { op: 'and', conditions: [] },
    schemaVersion: 1,
    isGlobal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    updatedBy: 'user-1',
    ...overrides,
  };
}

describe('SavedFiltersManager', () => {
  beforeEach(() => {
    updateFilterMutate.mockClear();
    deleteFilterMutate.mockClear();
  });

  it('shows empty message when no filters', () => {
    render(
      <SavedFiltersManager
        savedFilters={[]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByText('No saved filters yet.')).toBeInTheDocument();
  });

  it('renders filter name with edit and delete buttons for owner', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByText('My Filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rename filter My Filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete filter My Filter/i })).toBeInTheDocument();
  });

  it('hides edit and delete buttons for other user personal filter', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter({ userId: 'other-user' })]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('shows edit and delete for global filter when canManageGlobal', () => {
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter({ isGlobal: true, userId: 'other-user' })]}
        currentUserId="user-1"
        canManageGlobal={true}
        onFiltersChanged={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('enters rename mode on pencil click and calls updateFilter on save', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /rename filter My Filter/i }));
    const input = screen.getByRole('textbox', { name: /filter name/i });
    expect(input).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'New Name');
    await user.click(screen.getByRole('button', { name: /save name/i }));
    expect(updateFilterMutate).toHaveBeenCalledWith({ id: 'filter-1', data: { name: 'New Name' } });
  });

  it('cancels rename on Escape key', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /rename filter My Filter/i }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('My Filter')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('enters confirm-delete mode on trash click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls deleteFilter mutation on confirm-delete click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(deleteFilterMutate).toHaveBeenCalledWith({ id: 'filter-1' });
  });

  it('cancels delete on cancel click', async () => {
    const user = userEvent.setup();
    render(
      <SavedFiltersManager
        savedFilters={[makeFilter()]}
        currentUserId="user-1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete filter My Filter/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(deleteFilterMutate).not.toHaveBeenCalled();
    expect(screen.getByText('My Filter')).toBeInTheDocument();
  });
});
