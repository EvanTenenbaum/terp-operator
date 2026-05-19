// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: () => useQueryMock()
      }
    }
  }
}));
vi.mock('./UpdateRefereeRelationshipDialog', () => ({
  UpdateRefereeRelationshipDialog: () => <div data-testid="update-rel-dialog" />
}));
vi.mock('./DeactivateRefereeRelationshipDialog', () => ({
  DeactivateRefereeRelationshipDialog: () => <div data-testid="deactivate-rel-dialog" />
}));

import { RefereeRelationshipsList } from './RefereeRelationshipsList';

describe('RefereeRelationshipsList', () => {
  it('shows loading state when reference query is loading', () => {
    useQueryMock.mockReturnValueOnce({ data: undefined, isLoading: true });
    render(<RefereeRelationshipsList refereeId="ref-1" />);
    expect(screen.getByText(/loading relationships/i)).toBeInTheDocument();
  });

  it('shows empty state when no relationships match refereeId', () => {
    useQueryMock.mockReturnValueOnce({
      data: { refereeRelationships: [] },
      isLoading: false
    });
    render(<RefereeRelationshipsList refereeId="ref-1" />);
    expect(screen.getByText(/no relationships yet/i)).toBeInTheDocument();
  });

  it('renders relationship rows matching the given refereeId', () => {
    useQueryMock.mockReturnValueOnce({
      data: {
        refereeRelationships: [
          {
            id: 'rel-1',
            refereeId: 'ref-1',
            refereeName: 'Jane',
            entityType: 'customer',
            entityId: 'cust-1',
            entityName: 'Acme Co',
            feeType: 'percentage',
            feePercentage: 5,
            feeFixedAmount: null,
            applyByDefault: true,
            active: true
          },
          {
            id: 'rel-2',
            refereeId: 'other',
            refereeName: 'Other',
            entityType: 'customer',
            entityId: 'cust-2',
            entityName: 'Other Co',
            feeType: 'percentage',
            feePercentage: 10,
            feeFixedAmount: null,
            applyByDefault: false,
            active: true
          }
        ]
      },
      isLoading: false
    });
    render(<RefereeRelationshipsList refereeId="ref-1" />);
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    expect(screen.queryByText('Other Co')).not.toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
  });
});
