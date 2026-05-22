// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../api/trpc', () => ({
  trpc: {
    filters: {
      updateFilter: {
        useMutation: ({ onSuccess, onError }: { onSuccess?: () => void; onError?: () => void }) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      deleteFilter: {
        useMutation: ({ onSuccess, onError }: { onSuccess?: () => void; onError?: () => void }) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import { SavedFiltersManager } from './SavedFiltersManager';

const baseFilter = {
  id: 'f1',
  userId: 'u1',
  name: 'My Filter',
  description: undefined,
  targetView: 'inventory' as const,
  filterDefinition: { logic: 'AND' as const, conditions: [] },
  schemaVersion: 1,
  isGlobal: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'u1',
  updatedBy: 'u1',
};

describe('SavedFiltersManager accessibility', () => {
  it('rename and delete buttons have specific accessible labels', () => {
    render(
      <SavedFiltersManager
        savedFilters={[baseFilter]}
        currentUserId="u1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    const renameBtn = screen.getByRole('button', { name: /rename filter My Filter/i });
    const deleteBtn = screen.getByRole('button', { name: /delete filter My Filter/i });
    expect(renameBtn.getAttribute('aria-label')).toBeTruthy();
    expect(deleteBtn.getAttribute('aria-label')).toBeTruthy();
  });

  it('empty state is a paragraph element (not a heading)', () => {
    render(
      <SavedFiltersManager
        savedFilters={[]}
        currentUserId="u1"
        canManageGlobal={false}
        onFiltersChanged={() => {}}
      />
    );
    const empty = screen.getByText('No saved filters yet.');
    expect(empty.tagName.toLowerCase()).toBe('p');
  });
});
