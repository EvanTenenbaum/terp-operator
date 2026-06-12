// @vitest-environment jsdom
/**
 * UX-O02: PhotographyQueuePanel is mounted in InventoryView (the Inventory lane).
 *
 * The panel surfaces media-readiness CountPills so catalog decisions in the
 * Inventory lane reflect photo coverage without navigating to the Photography view.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: { id: 'user-1', role: 'operator' } })
      }
    },
    queries: {
      grid: {
        useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })
      },
      reference: {
        useQuery: () => ({ data: { defaultPricingRule: null, vendors: [] } })
      },
      photographyQueue: {
        useQuery: () => ({ data: [], refetch: vi.fn() })
      }
    }
  }
}));

// GridJourney renders prelude when canWrite=true. We mock GridJourney so the test
// isolates the InventoryView wiring without needing a full AG Grid environment.
// The mock renders the prelude prop so we can confirm PhotographyQueuePanel mounts.
vi.mock('./operations/shared', () => ({
  GridJourney: ({ prelude, selectionActions }: {
    prelude?: (runCommand: unknown) => React.ReactNode;
    selectionActions?: (rows: unknown[], runCommand: unknown) => React.ReactNode;
  }) => (
    <div data-testid="grid-journey">
      {prelude ? (
        <div data-testid="prelude-slot">{prelude(vi.fn())}</div>
      ) : (
        <div data-testid="no-prelude" />
      )}
    </div>
  )
}));

// PhotographyQueuePanel itself: mock to a sentinel so we can assert it mounts.
vi.mock('../components/PhotographyQueuePanel', () => ({
  PhotographyQueuePanel: () => (
    <div data-testid="photography-queue-panel">Photography Queue Panel</div>
  )
}));

import { InventoryView } from './InventoryView';

describe('InventoryView — UX-O02 PhotographyQueuePanel mount', () => {
  it('mounts PhotographyQueuePanel in the Inventory lane prelude slot', () => {
    render(<InventoryView />);
    // The prelude slot should be present and contain the panel.
    expect(screen.getByTestId('prelude-slot')).toBeInTheDocument();
    expect(screen.getByTestId('photography-queue-panel')).toBeInTheDocument();
  });

  it('renders the PhotographyQueuePanel text content', () => {
    render(<InventoryView />);
    expect(screen.getByText('Photography Queue Panel')).toBeInTheDocument();
  });

  it('passes a prelude prop to GridJourney (not null/undefined)', () => {
    render(<InventoryView />);
    // If prelude were absent, GridJourney mock would render <div data-testid="no-prelude"/>.
    expect(screen.queryByTestId('no-prelude')).not.toBeInTheDocument();
    expect(screen.getByTestId('prelude-slot')).toBeInTheDocument();
  });
});
