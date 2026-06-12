// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { InspectorDrawer } from './InspectorDrawer';

function renderDrawer(overrides: Partial<Parameters<typeof InspectorDrawer>[0]> = {}) {
  const onTabChange = vi.fn();
  const onClose = vi.fn();
  render(
    <InspectorDrawer
      open
      title="Row Inspector"
      subtitle="SO-1001"
      tabs={[
        { key: 'history', label: 'History', render: () => <div>history body</div> },
        { key: 'relationship', label: 'Relationship', render: () => <div>relationship body</div> },
        { key: 'issue', label: 'Issue', available: false, unavailableReason: 'Viewer role', render: () => <div>issue body</div> }
      ]}
      activeTab="history"
      onTabChange={onTabChange}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onTabChange, onClose };
}

describe('InspectorDrawer (templates)', () => {
  it('renders a modal dialog with title, subtitle, and a tablist', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Row Inspector' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('SO-1001')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Row Inspector sections' })).toBeTruthy();
  });

  it('marks the active tab selected and renders only its panel', () => {
    renderDrawer();
    const history = screen.getByRole('tab', { name: 'History' });
    expect(history.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('history body')).toBeTruthy();
    expect(screen.queryByText('relationship body')).toBeNull();
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(history.id);
  });

  it('switches tabs on click', () => {
    const { onTabChange } = renderDrawer();
    fireEvent.click(screen.getByRole('tab', { name: 'Relationship' }));
    expect(onTabChange).toHaveBeenCalledWith('relationship');
  });

  it('disables unavailable tabs with the reason as tooltip', () => {
    renderDrawer();
    const issue = screen.getByRole('tab', { name: 'Issue' }) as HTMLButtonElement;
    expect(issue.disabled).toBe(true);
    expect(issue.getAttribute('title')).toBe('Viewer role');
  });

  it('supports ArrowRight/ArrowLeft tab cycling across enabled tabs only', () => {
    const { onTabChange } = renderDrawer();
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('relationship');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    // Wraps past the disabled Issue tab back to relationship from history.
    expect(onTabChange).toHaveBeenLastCalledWith('relationship');
  });

  it('closes from the header button and the backdrop', () => {
    const { onClose } = renderDrawer();
    const closeButtons = screen.getAllByRole('button', { name: 'Close Row Inspector' });
    expect(closeButtons.length).toBe(2); // backdrop + header icon
    for (const button of closeButtons) fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('falls back to the first available tab when activeTab is unavailable', () => {
    renderDrawer({ activeTab: 'issue' });
    expect(screen.getByText('history body')).toBeTruthy();
  });
});
