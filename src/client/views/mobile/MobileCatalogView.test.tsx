// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../api/trpc', () => ({
  trpc: { queries: { grid: { useQuery: vi.fn() } } },
}));

import { trpc } from '../../api/trpc';
import { MobileCatalogView } from './MobileCatalogView';

const mockGrid = trpc.queries.grid.useQuery as ReturnType<typeof vi.fn>;

const ROWS = [
  { id: '1', batchCode: 'BL-01', name: 'Blue Dream',   availableQty: 48, uom: 'lb', unitPrice: 1850, publishedMediaCount: 3, hasPrimaryPhoto: true,  vendor: 'Green Valley', status: 'ready' },
  { id: '2', batchCode: 'WC-02', name: 'Wedding Cake', availableQty: 31, uom: 'lb', unitPrice: 1950, publishedMediaCount: 0, hasPrimaryPhoto: false, vendor: 'Riverwood',    status: 'ready' },
];

beforeEach(() => {
  mockGrid.mockReturnValue({ data: ROWS, isLoading: false });
});

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/mobile/catalog']}>
      <Routes>
        <Route path="/mobile/catalog"   element={<MobileCatalogView />} />
        <Route path="/mobile/inventory" element={<div>Inventory</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MobileCatalogView', () => {
  it('renders both catalog cards', () => {
    renderView();
    expect(screen.getByText('Blue Dream')).toBeInTheDocument();
    expect(screen.getByText('Wedding Cake')).toBeInTheDocument();
  });

  it('shows Has Photos badge for row with media', () => {
    renderView();
    // Blue Dream has publishedMediaCount: 3 → badge shows "3 photos"
    expect(screen.getByText('3 photos')).toBeInTheDocument();
  });

  it('shows No Photos badge for row without media', () => {
    renderView();
    // 'No Photos' appears in the filter chip and the card badge — ensure badge is present (span element)
    const items = screen.getAllByText('No Photos');
    expect(items.some(el => el.tagName === 'SPAN')).toBe(true);
  });

  it('opens bottom sheet when a card is tapped', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /open blue dream/i }));
    expect(screen.getByRole('dialog', { name: /catalog detail/i })).toBeInTheDocument();
  });

  it('closes bottom sheet when backdrop is clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /open blue dream/i }));
    fireEvent.click(screen.getByTestId('catalog-sheet-backdrop'));
    expect(screen.queryByRole('dialog', { name: /catalog detail/i })).not.toBeInTheDocument();
  });

  it('View in Inventory link navigates to /mobile/inventory?expand=id', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /open blue dream/i }));
    fireEvent.click(screen.getByRole('link', { name: /view in inventory/i }));
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });
});
