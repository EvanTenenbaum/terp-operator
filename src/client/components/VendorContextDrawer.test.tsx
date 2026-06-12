// @vitest-environment jsdom
/**
 * VendorContextDrawer — UX-A11
 * Brand removal must route through useConfirm() / ConfirmRoot instead of the
 * native browser confirm() so that it uses the shared focus-managed dialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useConfirmStore } from '../store/confirmStore';
import { ConfirmRoot } from './ConfirmRoot';

// ---------------------------------------------------------------------------
// Stub useFocusTrap so InspectorDrawer (and ConfirmRoot) work in jsdom
// ---------------------------------------------------------------------------
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

// ---------------------------------------------------------------------------
// trpc mock — only the vendorBrands procedures are exercised here
// ---------------------------------------------------------------------------
const listQueryMock = vi.fn();
const addMutationResult = { mutate: vi.fn(), isLoading: false };
const removeMutationResult = { mutate: vi.fn(), isLoading: false };
const renameMutationResult = { mutate: vi.fn(), isLoading: false };
const purchaseOrderLinesMock = vi.fn();

vi.mock('../api/trpc', () => ({
  trpc: {
    vendorBrands: {
      list: { useQuery: (_input: unknown, _opts?: unknown) => listQueryMock() },
      add: { useMutation: (opts: { onSuccess?: () => void }) => ({ ...addMutationResult, onSuccess: opts?.onSuccess }) },
      remove: { useMutation: (opts: { onSuccess?: () => void }) => ({ ...removeMutationResult, onSuccess: opts?.onSuccess }) },
      rename: { useMutation: (opts: { onSuccess?: () => void }) => ({ ...renameMutationResult, onSuccess: opts?.onSuccess }) },
    },
    queries: {
      purchaseOrderLines: { useQuery: (_input: unknown, _opts?: unknown) => purchaseOrderLinesMock() },
    },
  }
}));

// ---------------------------------------------------------------------------
// Import after mocks are set
// ---------------------------------------------------------------------------
import { VendorContextDrawer } from './VendorContextDrawer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VENDOR = { id: 'v-1', name: 'Acme Farms', termsDays: 30 };
const BRAND_1 = { id: 'b-1', name: 'Sunset OG', alias: 'sunset-og' };

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <ConfirmRoot />
      <VendorContextDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        vendor={VENDOR}
        relationshipData={null}
        historicalProducts={[]}
        onQuickAdd={vi.fn()}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  useConfirmStore.setState({ pending: null });
  purchaseOrderLinesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
  // Default: brands loaded with one item
  listQueryMock.mockReturnValue({
    data: [BRAND_1],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  removeMutationResult.mutate.mockReset();
  addMutationResult.mutate.mockReset();
  renameMutationResult.mutate.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('VendorContextDrawer — brand removal confirm flow (UX-A11)', () => {
  it('opens the ConfirmRoot dialog (not native confirm) when Remove is clicked', async () => {
    render(<Harness />);

    // Navigate to Brands tab
    fireEvent.click(screen.getByRole('tab', { name: 'Brands' }));

    // Remove button for BRAND_1 should be present
    const removeBtn = screen.getByRole('button', { name: `Remove ${BRAND_1.name}` });
    expect(removeBtn).toBeInTheDocument();

    // Click the remove button
    fireEvent.click(removeBtn);

    // A ConfirmRoot dialog should have appeared — identified by the shared
    // data-testid="confirm-backdrop" that ConfirmRoot always renders
    await waitFor(() => {
      expect(screen.getByTestId('confirm-backdrop')).toBeInTheDocument();
    });

    // Verify the dialog title
    expect(screen.getByText(`Remove "${BRAND_1.name}" from this vendor?`)).toBeInTheDocument();
    // Verify danger body copy
    expect(screen.getByText(/permanently unlink/i)).toBeInTheDocument();
    // Primary button label
    expect(screen.getByTestId('confirm-primary')).toHaveTextContent('Remove brand');
  });

  it('calls removeBrand.mutate when the user confirms the dialog', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('tab', { name: 'Brands' }));
    fireEvent.click(screen.getByRole('button', { name: `Remove ${BRAND_1.name}` }));

    await waitFor(() => expect(screen.getByTestId('confirm-backdrop')).toBeInTheDocument());

    // Confirm
    fireEvent.click(screen.getByTestId('confirm-primary'));

    await waitFor(() => {
      expect(removeMutationResult.mutate).toHaveBeenCalledWith({
        brandId: BRAND_1.id,
        vendorId: VENDOR.id,
      });
    });

    // Confirm dialog closes after confirmation
    await waitFor(() => expect(screen.queryByTestId('confirm-backdrop')).not.toBeInTheDocument());
  });

  it('does NOT call removeBrand.mutate when the user cancels the dialog', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('tab', { name: 'Brands' }));
    fireEvent.click(screen.getByRole('button', { name: `Remove ${BRAND_1.name}` }));

    await waitFor(() => expect(screen.getByTestId('confirm-backdrop')).toBeInTheDocument());

    // Cancel
    fireEvent.click(screen.getByTestId('confirm-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-backdrop')).not.toBeInTheDocument());

    expect(removeMutationResult.mutate).not.toHaveBeenCalled();
  });

  it('does NOT call removeBrand.mutate when the dialog is dismissed (settled false)', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('tab', { name: 'Brands' }));
    fireEvent.click(screen.getByRole('button', { name: `Remove ${BRAND_1.name}` }));

    await waitFor(() => expect(screen.getByTestId('confirm-backdrop')).toBeInTheDocument());

    // Settle the confirm store with false (simulates Escape / backdrop / cancel path)
    useConfirmStore.getState().settle(false);

    await waitFor(() => expect(screen.queryByTestId('confirm-backdrop')).not.toBeInTheDocument());

    expect(removeMutationResult.mutate).not.toHaveBeenCalled();
  });

  it('does not open the confirm dialog when vendorId is absent', async () => {
    // Render without a vendor (vendorId is undefined)
    render(
      <>
        <ConfirmRoot />
        <VendorContextDrawer
          isOpen
          onClose={vi.fn()}
          vendor={null}
          relationshipData={null}
          historicalProducts={[]}
          onQuickAdd={vi.fn()}
        />
      </>
    );

    // Navigate to Brands tab — with no vendorId the brands query is disabled and
    // the list will be empty, so Remove buttons are not rendered.
    fireEvent.click(screen.getByRole('tab', { name: 'Brands' }));

    // No dialog should appear
    expect(screen.queryByRole('dialog', { name: /remove/i })).not.toBeInTheDocument();
    expect(removeMutationResult.mutate).not.toHaveBeenCalled();
  });
});
