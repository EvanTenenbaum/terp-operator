// @vitest-environment jsdom
/**
 * Tests for WorkspacePanel focus/minimize behavior.
 * Issue #60: expanding one pane must minimize the sibling to an orientation-preserving
 * rail — NOT hide it completely (the pre-existing hiddenByFocus return null behavior).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- mock useUiStore ---
const togglePanelCollapsed = vi.fn();
const setFocusedPanel = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: vi.fn()
}));

import { useUiStore } from '../store/uiStore';
import { WorkspacePanel } from './WorkspacePanel';

type FakeState = {
  collapsedPanels: Record<string, boolean>;
  focusedPanelId: string | null;
  togglePanelCollapsed: typeof togglePanelCollapsed;
  setFocusedPanel: typeof setFocusedPanel;
};

function mockStore(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    collapsedPanels: {},
    focusedPanelId: null,
    togglePanelCollapsed,
    setFocusedPanel,
    ...overrides
  };
  // FakeState is a safe subset — cast through unknown so TypeScript doesn't enforce
  // the full UiState shape in tests that only exercise WorkspacePanel's dependencies.
  vi.mocked(useUiStore).mockImplementation(
    (selector) => selector(state as unknown as ReturnType<typeof useUiStore.getState>)
  );
}

beforeEach(() => {
  togglePanelCollapsed.mockClear();
  setFocusedPanel.mockClear();
});

describe('WorkspacePanel — default layout (no focus)', () => {
  it('renders the panel title and content', () => {
    mockStore();
    render(
      <WorkspacePanel panelId="test-panel" title="Test Panel">
        <div data-testid="panel-content">Content here</div>
      </WorkspacePanel>
    );
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });
});

describe('WorkspacePanel — expanded/focused panel', () => {
  it('adds workspace-panel-focused class when this panel is focused', () => {
    mockStore({ focusedPanelId: 'my-panel' });
    render(
      <WorkspacePanel panelId="my-panel" title="My Panel">
        <div>Content</div>
      </WorkspacePanel>
    );
    const section = screen.getByRole('region', { name: /my panel/i });
    expect(section).toHaveClass('workspace-panel-focused');
  });
});

describe('WorkspacePanel — sibling minimization (#60)', () => {
  it('renders a visible minimized rail when another panel has focus (not null/hidden)', () => {
    // PRE-CONDITION: 'other-panel' is focused, so 'my-panel' should be minimized.
    // OLD BEHAVIOR: returns null (the panel disappears).
    // NEW REQUIRED BEHAVIOR: renders a rail element so the sibling stays visible.
    mockStore({ focusedPanelId: 'other-panel' });
    render(
      <WorkspacePanel panelId="my-panel" title="My Panel" testId="my-panel">
        <div data-testid="panel-content">Content here</div>
      </WorkspacePanel>
    );
    // The panel title must remain visible in the rail
    expect(screen.getByText('My Panel')).toBeInTheDocument();
    // The panel content must NOT be visible (minimized)
    expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
    // The rail should signal its minimized state (aria or class)
    const rail = screen.getByRole('region');
    expect(rail).toHaveClass('workspace-panel-rail');
  });

  it('shows a restore button in the rail that calls setFocusedPanel(null)', async () => {
    mockStore({ focusedPanelId: 'other-panel' });
    const user = userEvent.setup();
    render(
      <WorkspacePanel panelId="my-panel" title="My Panel">
        <div>Content</div>
      </WorkspacePanel>
    );
    const restoreBtn = screen.getByRole('button', { name: /restore/i });
    await user.click(restoreBtn);
    expect(setFocusedPanel).toHaveBeenCalledWith(null);
  });

  it('does not render panel content in the rail (minimized state)', () => {
    mockStore({ focusedPanelId: 'other-panel' });
    render(
      <WorkspacePanel panelId="my-panel" title="My Panel">
        <div data-testid="heavy-content">Heavy content</div>
      </WorkspacePanel>
    );
    expect(screen.queryByTestId('heavy-content')).not.toBeInTheDocument();
  });

  it('restores the split layout when setFocusedPanel(null) is called', async () => {
    // Simulate: was focused, now restored (focusedPanelId = null)
    mockStore({ focusedPanelId: null });
    const user = userEvent.setup();
    render(
      <WorkspacePanel panelId="my-panel" title="My Panel">
        <div data-testid="panel-content">Full content</div>
      </WorkspacePanel>
    );
    // Both panels should be visible in split layout
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
    // The expand button should not say 'Restore' (not in focus mode)
    const expandBtn = screen.getByRole('button', { name: /expand/i });
    await user.click(expandBtn);
    expect(setFocusedPanel).toHaveBeenCalledWith('my-panel');
  });
});
