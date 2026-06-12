// @vitest-environment jsdom
// UX-S05: ExpansionPanel collapsible headers must be native <button> elements
// so tab order, Enter/Space activation, and aria-expanded semantics work
// without custom keyDown handlers (K12 leftover fix).
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GridRow } from '../../shared/types';
import { ExpansionPanel } from './ExpansionPanel';

const row: GridRow = { id: 'row-1', status: 'draft' } as GridRow;

describe('ExpansionPanel — UX-S05 native button headers', () => {
  it('History toggle is a native button (not div+role=button)', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /history/i });
    // Must be a real <button>, not a div with role=button
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('Child Items toggle is a native button', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        childrenRenderer={() => <div>children content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /child items/i });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('History button has aria-expanded=false initially', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /history/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking History button expands the content and sets aria-expanded=true', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /history/i });
    expect(screen.queryByText('history content')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('history content')).toBeTruthy();
  });

  it('clicking History button again collapses the content', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /history/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('history content')).toBeNull();
  });

  it('clicking Child Items button expands and collapses independently', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
        childrenRenderer={() => <div>children content</div>}
      />
    );
    const histBtn = screen.getByRole('button', { name: /history/i });
    const childBtn = screen.getByRole('button', { name: /child items/i });

    fireEvent.click(histBtn);
    expect(screen.getByText('history content')).toBeTruthy();
    expect(screen.queryByText('children content')).toBeNull();

    fireEvent.click(childBtn);
    expect(screen.getByText('history content')).toBeTruthy();
    expect(screen.getByText('children content')).toBeTruthy();
  });

  it('Actions section renders without a toggle button', () => {
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        actionsRenderer={() => <button type="button">Do action</button>}
      />
    );
    expect(screen.getByText('Actions')).toBeTruthy();
    // The static header is a div, not a button; only the inner action renders as button
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toContain('Do action');
    // No expand/collapse button for the actions section
    const historyBtn = screen.queryByRole('button', { name: /history/i });
    expect(historyBtn).toBeNull();
  });

  it('UX-S05 note: AG Grid provides its own tab-into-grid → header → cell navigation; ExpansionPanel renders outside the grid and participates in the host page tab order via native button focus', () => {
    // This test documents what AG Grid provides vs. what this component fixes.
    // AG Grid: tabbing into the grid focuses the first header cell (suppressMovableColumns
    // aside), then ArrowDown moves to the first data cell. Selection checkboxes are
    // controlled by AG Grid's internal keyboard handling. The SelectionSummary strip
    // (StatusActionBar) renders outside the grid and is natively reachable via Tab.
    // ExpansionPanel (rendered in AG Grid's master-detail row) now participates via
    // its native <button> headers — no further fix needed on this component.
    render(
      <ExpansionPanel
        row={row}
        view="orders"
        historyRenderer={() => <div>history content</div>}
      />
    );
    const btn = screen.getByRole('button', { name: /history/i });
    // Native button: no custom tabIndex override was required (div+role=button
    // needed explicit tabIndex={0}; a real <button> is inherently focusable).
    // jsdom reports tabIndex as the property value (0 is the HTML default for
    // buttons); what matters is that the component does NOT set tabIndex prop.
    expect(btn.getAttribute('type')).toBe('button');
    // Verify we have a genuine button element — role=button on a div would also
    // satisfy getByRole('button'), so check the tag explicitly.
    expect(btn.tagName).toBe('BUTTON');
  });
});
