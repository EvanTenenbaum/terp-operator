// @vitest-environment jsdom
/**
 * UX-G02 — order-level shared-source pre-check chip for the Orders grid.
 * Renders only for OPEN orders (draft/confirmed) whose payload carries
 * crossOrderSourceOrders (allowlist field extension in queries.ts orders
 * case). Informational only — copy must not promise a guaranteed refusal.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrossOrderSourceChip, crossOrderSourceColumn } from './CrossOrderSourceChip';
import type { GridRow } from '../../shared/types';

describe('<CrossOrderSourceChip>', () => {
  it.each(['draft', 'confirmed'])('renders the chip for open status %s with conflicting order numbers', (status) => {
    render(<CrossOrderSourceChip status={status} conflictOrders="SO-1002, SO-1007" />);
    const chip = screen.getByTestId('cross-order-source-chip');
    expect(chip.textContent).toContain('Shared source: SO-1002, SO-1007');
    // Conservative money-path copy: "may be refused", never "will be refused".
    expect(chip.getAttribute('title')).toMatch(/may be refused/);
    expect(chip.getAttribute('title')).toContain('SO-1002, SO-1007');
  });

  it.each(['posted', 'fulfilled', 'cancelled'])('renders nothing for non-open status %s even with conflicts', (status) => {
    const { container } = render(<CrossOrderSourceChip status={status} conflictOrders="SO-1002" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when there is no conflict payload', () => {
    for (const value of [null, undefined, '', '   ']) {
      const { container } = render(<CrossOrderSourceChip status="draft" conflictOrders={value} />);
      expect(container.innerHTML).toBe('');
    }
  });
});

describe('crossOrderSourceColumn', () => {
  it('targets the crossOrderSourceOrders field added by the UX-G02 query extension', () => {
    expect(crossOrderSourceColumn.field).toBe('crossOrderSourceOrders');
    expect(crossOrderSourceColumn.headerName).toBe('Source conflict');
  });

  it('cellRenderer shows the chip for an open row and nothing for a posted row', () => {
    const renderer = crossOrderSourceColumn.cellRenderer as (params: { data?: GridRow }) => React.ReactElement | null;
    const open = render(renderer({ data: { id: '1', status: 'confirmed', crossOrderSourceOrders: 'SO-9' } as unknown as GridRow })!);
    expect(open.getByTestId('cross-order-source-chip').textContent).toContain('SO-9');
    open.unmount();

    const posted = render(<>{renderer({ data: { id: '2', status: 'posted', crossOrderSourceOrders: 'SO-9' } as unknown as GridRow })}</>);
    expect(posted.container.querySelector('[data-testid="cross-order-source-chip"]')).toBeNull();
    expect(renderer({ data: undefined })).toBeNull();
  });
});
