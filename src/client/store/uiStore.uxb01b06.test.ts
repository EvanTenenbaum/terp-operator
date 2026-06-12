// @vitest-environment jsdom
/**
 * uiStore additive state tests for UX-B01 and UX-B06.
 *
 * UX-B01: navGroupExpansion — persisted, benign UX preference.
 * UX-B06: dismissedDrawerCoachmark — persisted, benign UX preference.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

const STORAGE_KEY = 'terp-agro-ui';

function readPersisted(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return (parsed?.state ?? parsed) as Record<string, unknown>;
}

describe('uiStore UX-B01 — navGroupExpansion', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ navGroupExpansion: {} });
  });

  it('defaults navGroupExpansion to empty object', () => {
    expect(useUiStore.getState().navGroupExpansion).toEqual({});
  });

  it('setNavGroupExpanded(group, true) expands a group', () => {
    useUiStore.getState().setNavGroupExpanded('Procure', true);
    expect(useUiStore.getState().navGroupExpansion['Procure']).toBe(true);
  });

  it('setNavGroupExpanded(group, false) collapses a group', () => {
    useUiStore.setState({ navGroupExpansion: { Procure: true } });
    useUiStore.getState().setNavGroupExpanded('Procure', false);
    expect(useUiStore.getState().navGroupExpansion['Procure']).toBe(false);
  });

  it('sets announcement when expanding', () => {
    useUiStore.getState().setNavGroupExpanded('Admin', true);
    expect(useUiStore.getState().announcement).toBe('Admin expanded.');
  });

  it('sets announcement when collapsing', () => {
    useUiStore.setState({ navGroupExpansion: { Admin: true } });
    useUiStore.getState().setNavGroupExpanded('Admin', false);
    expect(useUiStore.getState().announcement).toBe('Admin collapsed.');
  });

  it('persists navGroupExpansion to localStorage', () => {
    useUiStore.getState().setNavGroupExpanded('Money', true);
    // Flush persist with a second mutation
    useUiStore.getState().setShowMargin(true);
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('navGroupExpansion');
    expect((persisted.navGroupExpansion as Record<string, boolean>)['Money']).toBe(true);
  });

  it('multiple groups can be independently expanded', () => {
    useUiStore.getState().setNavGroupExpanded('Procure', true);
    useUiStore.getState().setNavGroupExpanded('Sell', false);
    useUiStore.getState().setNavGroupExpanded('Money', true);
    const expansion = useUiStore.getState().navGroupExpansion;
    expect(expansion['Procure']).toBe(true);
    expect(expansion['Sell']).toBe(false);
    expect(expansion['Money']).toBe(true);
  });
});

describe('uiStore UX-B06 — dismissedDrawerCoachmark', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ dismissedDrawerCoachmark: false });
  });

  it('defaults dismissedDrawerCoachmark to false', () => {
    expect(useUiStore.getState().dismissedDrawerCoachmark).toBe(false);
  });

  it('setDismissedDrawerCoachmark(true) sets the flag', () => {
    useUiStore.getState().setDismissedDrawerCoachmark(true);
    expect(useUiStore.getState().dismissedDrawerCoachmark).toBe(true);
  });

  it('persists dismissedDrawerCoachmark to localStorage', () => {
    useUiStore.getState().setDismissedDrawerCoachmark(true);
    useUiStore.getState().setShowMargin(true); // flush
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('dismissedDrawerCoachmark', true);
  });

  it('does NOT reset dismissedDrawerCoachmark on resetSession (it is a UX preference)', () => {
    useUiStore.setState({ dismissedDrawerCoachmark: true });
    useUiStore.getState().resetSession();
    // resetSession does not touch this preference — same pattern as showMargin
    // Preferences are preserved; entity/session state is cleared.
    // Note: resetSession does not explicitly re-set dismissedDrawerCoachmark,
    // so it retains its in-memory value unless the store is re-initialized.
    // The persisted value is what matters across page loads.
    expect(useUiStore.getState().dismissedDrawerCoachmark).toBe(true);
  });
});
