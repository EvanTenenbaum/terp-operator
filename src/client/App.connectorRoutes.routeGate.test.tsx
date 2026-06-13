// @vitest-environment jsdom
/**
 * TER-1664 / UX-A12 (Execution Decision 4) — connector/processor route gate
 *
 * The standalone /connectors and /processors surfaces are MVP-out. While
 * CONNECTOR_SURFACES_ENABLED (src/client/featureFlags.ts) is false, both
 * routes redirect to Settings → Requests, the lanes are removed from
 * defaultOperatorViews, and the components stay intact for re-enable.
 *
 * Follows the MergeCandidatesView.routeGate.test.tsx pattern: the route table
 * mirrors App.tsx (same flag ternary, same redirect behaviour) so the gate
 * cannot be reached by direct URL. The redirect stand-in mirrors App.tsx's
 * SettingsRequestsRedirect, using the REAL uiStore so the Requests-tab
 * targeting is asserted, and the REAL flag so flipping it is caught here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { CONNECTOR_SURFACES_ENABLED } from './featureFlags';
import { viewVisibleForUser } from './accessPolicy';
import { useUiStore } from './store/uiStore';
import type { SessionUser } from '../shared/types';

// Lightweight stand-in for SettingsView — avoids needing trpc mocks here.
function FakeSettingsView() {
  return <div data-testid="settings-view">Settings</div>;
}

// Sentinels — should never render while the flag is off.
function FakeConnectorsView() {
  return <div data-testid="connectors-view">Connectors</div>;
}
function FakeProcessorsView() {
  return <div data-testid="processors-view">Processors</div>;
}

// Mirrors App.tsx SettingsRequestsRedirect (TER-1664 / UX-A12).
function SettingsRequestsRedirect() {
  const navigate = useNavigate();
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  useEffect(() => {
    setActiveSettingsTab('requests');
    navigate('/settings', { replace: true });
  }, [navigate, setActiveSettingsTab]);
  return null;
}

// Renders the same route table shape used in App.tsx (just the gated slice).
function TestRoutes({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="settings" element={<FakeSettingsView />} />
        {/* TER-1664 / UX-A12 flag ternaries — mirror App.tsx */}
        <Route path="connectors" element={CONNECTOR_SURFACES_ENABLED ? <FakeConnectorsView /> : <SettingsRequestsRedirect />} />
        <Route path="processors" element={CONNECTOR_SURFACES_ENABLED ? <FakeProcessorsView /> : <SettingsRequestsRedirect />} />
      </Routes>
    </MemoryRouter>
  );
}

function makeUser(role: SessionUser['role']): SessionUser {
  return { id: 'u-1', role, email: 'op@example.test', name: 'Op', workLoop: null } as SessionUser;
}

beforeEach(() => {
  useUiStore.setState({ activeSettingsTab: 'pricing' });
});

describe('connector/processor route gate — TER-1664 / UX-A12', () => {
  it('the flag is off for MVP (Execution Decision 4)', () => {
    expect(CONNECTOR_SURFACES_ENABLED).toBe(false);
  });

  it('redirects /connectors to /settings and targets the Requests tab', () => {
    render(<TestRoutes initialPath="/connectors" />);
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.queryByTestId('connectors-view')).not.toBeInTheDocument();
    expect(useUiStore.getState().activeSettingsTab).toBe('requests');
  });

  it('redirects /processors to /settings and targets the Requests tab', () => {
    render(<TestRoutes initialPath="/processors" />);
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.queryByTestId('processors-view')).not.toBeInTheDocument();
    expect(useUiStore.getState().activeSettingsTab).toBe('requests');
  });

  it('/settings renders directly (no redirect interference)', () => {
    render(<TestRoutes initialPath="/settings" />);
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
  });

  it('removes the connectors/processors lanes from operator access policy while flagged off', () => {
    const operator = makeUser('operator');
    expect(viewVisibleForUser('connectors', operator)).toBe(CONNECTOR_SURFACES_ENABLED);
    expect(viewVisibleForUser('processors', operator)).toBe(CONNECTOR_SURFACES_ENABLED);
    const owner = makeUser('owner');
    expect(viewVisibleForUser('connectors', owner)).toBe(CONNECTOR_SURFACES_ENABLED);
    expect(viewVisibleForUser('processors', owner)).toBe(CONNECTOR_SURFACES_ENABLED);
  });

  it('does not disturb neighbouring lanes in the access policy', () => {
    const operator = makeUser('operator');
    expect(viewVisibleForUser('recovery', operator)).toBe(true);
    expect(viewVisibleForUser('dashboard', operator)).toBe(true);
    expect(viewVisibleForUser('photography', operator)).toBe(true);
    const owner = makeUser('owner');
    expect(viewVisibleForUser('settings', owner)).toBe(true);
    expect(viewVisibleForUser('closeout', owner)).toBe(true);
  });
});
